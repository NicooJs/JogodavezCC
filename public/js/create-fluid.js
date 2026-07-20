// Fundo animado da tela de criação, versão "fluido de verdade" -- simulação
// de dinâmica de fluidos (Navier-Stokes, método "stable fluids") rodando em
// shaders WebGL, reagindo ao cursor. Referência visual: o usuário mandou
// https://21st.dev/@uniquesonu/components/smokey-cursor-effect (componente
// React que descreve a própria técnica: "simulation uses WebGL shaders to
// create realistic fluid dynamics in real-time"). Isso aqui é uma
// implementação nossa, vanilla, dessa técnica bem conhecida -- não código
// copiado do componente deles (que é React/Tailwind, framework diferente).
//
// Sem lib nova nenhuma: é só JS + strings de GLSL, carregado puro pelo
// navegador, mesma filosofia zero-dependência do resto do projeto (só que
// aqui nem tem import nenhum -- WebGL é API nativa do browser).
//
// Pipeline por frame: splat (injeta cor+velocidade no cursor) -> curl
// (vorticidade) -> vorticity confinement (realimenta rotação, é isso que dá
// o "redemoinho" de fumaça) -> divergence -> pressure (Jacobi, ~20
// iterações) -> gradient subtraction (tira a divergência da velocidade) ->
// advection (arrasta velocidade e cor pelo campo). Cada campo (velocidade,
// densidade/cor, pressão) vive em um par de texturas ping-pong (framebuffer
// A/B, troca de qual é "leitura" e qual é "escrita" a cada passo).

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("create-fx-canvas");

if (canvas && !reduceMotion) {
  try {
    startFluid(canvas);
  } catch (err) {
    // WebGL indisponível, extensão faltando, shader não compilou, etc --
    // degrade seguro: o fundo sólido do tema (--bg) já está sempre por
    // baixo do canvas (que só não desenha nada em cima dele nesse caso).
    console.error("Fundo de fluido não iniciou, seguindo com fundo sólido:", err.message);
  }
}

function startFluid(canvas) {
  const config = {
    SIM_RESOLUTION: 128,
    DYE_RESOLUTION: 512,
    DENSITY_DISSIPATION: 1.35,
    VELOCITY_DISSIPATION: 0.25,
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: 20,
    CURL: 28,
    SPLAT_RADIUS: 0.22,
    SPLAT_FORCE: 4000,
    IDLE_MS: 2200,
    AUTO_SPLAT_INTERVAL_MS: 1200,
  };

  const { gl, ext } = getWebGLContext(canvas);

  const baseVertexShader = compileShader(gl, gl.VERTEX_SHADER, `
    precision highp float;
    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 texelSize;
    void main () {
      vUv = aPosition * 0.5 + 0.5;
      vL = vUv - vec2(texelSize.x, 0.0);
      vR = vUv + vec2(texelSize.x, 0.0);
      vT = vUv + vec2(0.0, texelSize.y);
      vB = vUv - vec2(0.0, texelSize.y);
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `);

  const copyShader = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    void main () { gl_FragColor = texture2D(uTexture, vUv); }
  `);

  const clearShader = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;
    void main () { gl_FragColor = value * texture2D(uTexture, vUv); }
  `);

  const splatShader = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;
    void main () {
      vec2 p = vUv - point.xy;
      p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      vec3 base = texture2D(uTarget, vUv).xyz;
      gl_FragColor = vec4(base + splat, 1.0);
    }
  `);

  const advectionShader = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform float dt;
    uniform float dissipation;
    void main () {
      vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
      vec4 result = texture2D(uSource, coord);
      float decay = 1.0 + dissipation * dt;
      gl_FragColor = result / decay;
    }
  `);

  const divergenceShader = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).x;
      float R = texture2D(uVelocity, vR).x;
      float T = texture2D(uVelocity, vT).y;
      float B = texture2D(uVelocity, vB).y;
      vec2 C = texture2D(uVelocity, vUv).xy;
      if (vL.x < 0.0) { L = -C.x; }
      if (vR.x > 1.0) { R = -C.x; }
      if (vT.y > 1.0) { T = -C.y; }
      if (vB.y < 0.0) { B = -C.y; }
      float div = 0.5 * (R - L + T - B);
      gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
  `);

  const curlShader = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).y;
      float R = texture2D(uVelocity, vR).y;
      float T = texture2D(uVelocity, vT).x;
      float B = texture2D(uVelocity, vB).x;
      float vorticity = R - L - T + B;
      gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }
  `);

  const vorticityShader = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float curl;
    uniform float dt;
    void main () {
      float L = texture2D(uCurl, vL).x;
      float R = texture2D(uCurl, vR).x;
      float T = texture2D(uCurl, vT).x;
      float B = texture2D(uCurl, vB).x;
      float C = texture2D(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= curl * C;
      force.y *= -1.0;
      vec2 vel = texture2D(uVelocity, vUv).xy;
      vel += force * dt;
      vel = min(max(vel, -1000.0), 1000.0);
      gl_FragColor = vec4(vel, 0.0, 1.0);
    }
  `);

  const pressureShader = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      float divergence = texture2D(uDivergence, vUv).x;
      float pressure = (L + R + B + T - divergence) * 0.25;
      gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
  `);

  const gradientSubtractShader = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      vec2 velocity = texture2D(uVelocity, vUv).xy;
      velocity.xy -= vec2(R - L, T - B);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
  `);

  const displayShader = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    void main () {
      vec3 c = texture2D(uTexture, vUv).rgb;
      gl_FragColor = vec4(c, 1.0);
    }
  `);

  const copyProgram = createProgram(gl, baseVertexShader, copyShader);
  const clearProgram = createProgram(gl, baseVertexShader, clearShader);
  const splatProgram = createProgram(gl, baseVertexShader, splatShader);
  const advectionProgram = createProgram(gl, baseVertexShader, advectionShader);
  const divergenceProgram = createProgram(gl, baseVertexShader, divergenceShader);
  const curlProgram = createProgram(gl, baseVertexShader, curlShader);
  const vorticityProgram = createProgram(gl, baseVertexShader, vorticityShader);
  const pressureProgram = createProgram(gl, baseVertexShader, pressureShader);
  const gradientSubtractProgram = createProgram(gl, baseVertexShader, gradientSubtractShader);
  const displayProgram = createProgram(gl, baseVertexShader, displayShader);

  const blit = initBlit(gl);

  let dye, velocity, divergence, curlFbo, pressure;
  initFramebuffers();

  function initFramebuffers() {
    const simRes = getResolution(config.SIM_RESOLUTION);
    const dyeRes = getResolution(config.DYE_RESOLUTION);
    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA;
    const rg = ext.formatRG;
    const r = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.BLEND);

    dye = createDoubleFBO(gl, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    velocity = createDoubleFBO(gl, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    divergence = createFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    curlFbo = createFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    pressure = createDoubleFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
  }

  function getResolution(resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
    const min = Math.round(resolution);
    const max = Math.round(resolution * aspectRatio);
    if (gl.drawingBufferWidth > gl.drawingBufferHeight) return { width: max, height: min };
    return { width: min, height: max };
  }

  // --- cor: sempre puxada do tema (var(--accent) etc), nunca fixa. A tela
  // de criação não troca de tema ao vivo (diferente do board), então lê uma
  // vez só no início. --positive entra pra dar variedade de matiz (é um
  // token fixo entre temas, já usado decorativamente em outros lugares do
  // site, tipo o ícone de moeda do título do board).
  function hexToRgb(hex) {
    const clean = hex.trim().replace("#", "");
    const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
    const num = parseInt(full, 16);
    if (Number.isNaN(num)) return [0.72, 0.55, 0.96];
    return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
  }

  const rootStyle = getComputedStyle(document.documentElement);
  const palette = ["--accent", "--accent-text", "--positive"]
    .map((token) => rootStyle.getPropertyValue(token))
    .filter((value) => value && value.trim().startsWith("#"))
    .map(hexToRgb);
  if (palette.length === 0) palette.push([0.72, 0.55, 0.96]);

  function nextColor() {
    const base = palette[Math.floor(Math.random() * palette.length)];
    // leve variação de intensidade pra não repetir sempre o mesmo tom exato
    const k = 0.7 + Math.random() * 0.5;
    return [base[0] * k, base[1] * k, base[2] * k];
  }

  // --- ponteiro: um listener só na window (não no canvas), assim
  // .create-bg continua com pointer-events:none e não existe risco nenhum
  // de roubar clique do formulário.
  const pointer = { x: 0.5, y: 0.5, prevX: 0.5, prevY: 0.5, moved: false };
  let lastMoveAt = performance.now();

  window.addEventListener("pointermove", (e) => {
    pointer.prevX = pointer.x;
    pointer.prevY = pointer.y;
    pointer.x = e.clientX / window.innerWidth;
    // Y invertido: UV do WebGL cresce de baixo pra cima, coordenada de
    // mouse cresce de cima pra baixo -- sem inverter aqui, o rastro sai de
    // cabeça pra baixo em relação ao cursor de verdade.
    pointer.y = 1 - e.clientY / window.innerHeight;
    pointer.moved = true;
    lastMoveAt = performance.now();
  });

  function correctDeltaX(delta) {
    const aspectRatio = canvas.width / canvas.height;
    return aspectRatio < 1 ? delta * aspectRatio : delta;
  }
  function correctDeltaY(delta) {
    const aspectRatio = canvas.width / canvas.height;
    return aspectRatio > 1 ? delta / aspectRatio : delta;
  }
  function correctRadius(radius) {
    const aspectRatio = canvas.width / canvas.height;
    return aspectRatio > 1 ? radius * aspectRatio : radius;
  }

  function splat(x, y, dx, dy, color) {
    gl.useProgram(splatProgram.program);
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x, y);
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(splatProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100.0));
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(splatProgram.uniforms.color, color[0], color[1], color[2]);
    blit(dye.write);
    dye.swap();
  }

  function splatFromPointer() {
    const dx = correctDeltaX(pointer.x - pointer.prevX) * config.SPLAT_FORCE;
    const dy = correctDeltaY(pointer.y - pointer.prevY) * config.SPLAT_FORCE;
    splat(pointer.x, pointer.y, dx, dy, nextColor());
  }

  let lastAutoSplatAt = 0;
  let autoTargetX = 0.5;
  let autoTargetY = 0.5;
  function autoSplat(now) {
    lastAutoSplatAt = now;
    autoTargetX += (Math.random() - 0.5) * 0.3;
    autoTargetY += (Math.random() - 0.5) * 0.3;
    autoTargetX = Math.min(0.85, Math.max(0.15, autoTargetX));
    autoTargetY = Math.min(0.85, Math.max(0.15, autoTargetY));
    const dx = (Math.random() - 0.5) * config.SPLAT_FORCE * 0.5;
    const dy = (Math.random() - 0.5) * config.SPLAT_FORCE * 0.5;
    splat(autoTargetX, autoTargetY, dx, dy, nextColor());
  }

  function applyInputs(now) {
    if (pointer.moved) {
      pointer.moved = false;
      splatFromPointer();
    } else if (now - lastMoveAt > config.IDLE_MS && now - lastAutoSplatAt > config.AUTO_SPLAT_INTERVAL_MS) {
      autoSplat(now);
    }
  }

  function step(dt) {
    gl.disable(gl.BLEND);

    gl.useProgram(curlProgram.program);
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(curlFbo);

    gl.useProgram(vorticityProgram.program);
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curlFbo.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();

    gl.useProgram(divergenceProgram.program);
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    gl.useProgram(clearProgram.program);
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    gl.useProgram(pressureProgram.program);
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    gl.useProgram(gradientSubtractProgram.program);
    gl.uniform2f(gradientSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradientSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradientSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    gl.useProgram(advectionProgram.program);
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource, velocity.read.attach(0));
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
  }

  function render() {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.disable(gl.BLEND);
    gl.useProgram(displayProgram.program);
    gl.uniform1i(displayProgram.uniforms.uTexture, dye.read.attach(0));
    blit(null);
  }

  let lastUpdateAt = performance.now();
  function update() {
    const now = performance.now();
    let dt = (now - lastUpdateAt) / 1000;
    dt = Math.min(dt, 0.0334); // capa em ~2 frames de 60fps -- sem isso, voltar de uma aba
                               // em segundo plano dá um "dt" gigante e a simulação explode
    lastUpdateAt = now;

    resizeCanvasIfNeeded();
    applyInputs(now);
    step(dt);
    render();
    requestAnimationFrame(update);
  }

  function resizeCanvasIfNeeded() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.round(window.innerWidth * dpr);
    const height = Math.round(window.innerHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      initFramebuffers();
    }
  }

  requestAnimationFrame(update);

  // --- helpers WebGL ---

  function getWebGLContext(canvas) {
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
    let glContext = canvas.getContext("webgl2", params);
    const isWebGL2 = !!glContext;
    if (!glContext) {
      glContext = canvas.getContext("webgl", params) || canvas.getContext("experimental-webgl", params);
    }
    if (!glContext) throw new Error("WebGL indisponível nesse navegador");

    let halfFloatTexType;
    let supportLinearFiltering;
    if (isWebGL2) {
      glContext.getExtension("EXT_color_buffer_float");
      supportLinearFiltering = !!glContext.getExtension("OES_texture_float_linear");
      halfFloatTexType = glContext.HALF_FLOAT;
    } else {
      const halfFloat = glContext.getExtension("OES_texture_half_float");
      supportLinearFiltering = !!glContext.getExtension("OES_texture_half_float_linear");
      if (!halfFloat) throw new Error("Extensão de textura float ausente");
      halfFloatTexType = halfFloat.HALF_FLOAT_OES;
    }

    glContext.clearColor(0, 0, 0, 1);

    const formatRGBA = getSupportedFormat(glContext, isWebGL2, isWebGL2 ? glContext.RGBA16F : glContext.RGBA, glContext.RGBA, halfFloatTexType);
    const formatRG = isWebGL2
      ? getSupportedFormat(glContext, isWebGL2, glContext.RG16F, glContext.RG, halfFloatTexType)
      : formatRGBA;
    const formatR = isWebGL2
      ? getSupportedFormat(glContext, isWebGL2, glContext.R16F, glContext.RED, halfFloatTexType)
      : formatRGBA;

    return {
      gl: glContext,
      ext: { halfFloatTexType, supportLinearFiltering, formatRGBA, formatRG, formatR },
    };
  }

  function getSupportedFormat(glContext, isWebGL2, internalFormat, format, type) {
    if (!supportRenderTextureFormat(glContext, internalFormat, format, type)) {
      if (isWebGL2 && internalFormat === glContext.R16F) {
        return getSupportedFormat(glContext, isWebGL2, glContext.RG16F, glContext.RG, type);
      }
      if (isWebGL2 && internalFormat === glContext.RG16F) {
        return getSupportedFormat(glContext, isWebGL2, glContext.RGBA16F, glContext.RGBA, type);
      }
      throw new Error("Nenhum formato de textura suportado");
    }
    return { internalFormat, format };
  }

  function supportRenderTextureFormat(glContext, internalFormat, format, type) {
    const texture = glContext.createTexture();
    glContext.bindTexture(glContext.TEXTURE_2D, texture);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, glContext.NEAREST);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MAG_FILTER, glContext.NEAREST);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, glContext.CLAMP_TO_EDGE);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, glContext.CLAMP_TO_EDGE);
    glContext.texImage2D(glContext.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

    const fbo = glContext.createFramebuffer();
    glContext.bindFramebuffer(glContext.FRAMEBUFFER, fbo);
    glContext.framebufferTexture2D(glContext.FRAMEBUFFER, glContext.COLOR_ATTACHMENT0, glContext.TEXTURE_2D, texture, 0);
    const status = glContext.checkFramebufferStatus(glContext.FRAMEBUFFER);
    return status === glContext.FRAMEBUFFER_COMPLETE;
  }

  function compileShader(glContext, type, source) {
    const shader = glContext.createShader(type);
    glContext.shaderSource(shader, source);
    glContext.compileShader(shader);
    if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
      throw new Error(glContext.getShaderInfoLog(shader));
    }
    return shader;
  }

  function createProgram(glContext, vertexShader, fragmentShader) {
    const program = glContext.createProgram();
    glContext.attachShader(program, vertexShader);
    glContext.attachShader(program, fragmentShader);
    glContext.linkProgram(program);
    if (!glContext.getProgramParameter(program, glContext.LINK_STATUS)) {
      throw new Error(glContext.getProgramInfoLog(program));
    }
    const uniforms = {};
    const count = glContext.getProgramParameter(program, glContext.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = glContext.getActiveUniform(program, i);
      uniforms[info.name] = glContext.getUniformLocation(program, info.name);
    }
    return { program, uniforms };
  }

  function initBlit(glContext) {
    const vertexBuffer = glContext.createBuffer();
    glContext.bindBuffer(glContext.ARRAY_BUFFER, vertexBuffer);
    glContext.bufferData(glContext.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), glContext.STATIC_DRAW);
    const elementBuffer = glContext.createBuffer();
    glContext.bindBuffer(glContext.ELEMENT_ARRAY_BUFFER, elementBuffer);
    glContext.bufferData(glContext.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), glContext.STATIC_DRAW);
    glContext.vertexAttribPointer(0, 2, glContext.FLOAT, false, 0, 0);
    glContext.enableVertexAttribArray(0);

    return (target) => {
      if (target == null) {
        glContext.viewport(0, 0, glContext.drawingBufferWidth, glContext.drawingBufferHeight);
        glContext.bindFramebuffer(glContext.FRAMEBUFFER, null);
      } else {
        glContext.viewport(0, 0, target.width, target.height);
        glContext.bindFramebuffer(glContext.FRAMEBUFFER, target.fbo);
      }
      glContext.drawElements(glContext.TRIANGLES, 6, glContext.UNSIGNED_SHORT, 0);
    };
  }

  function createFBO(glContext, w, h, internalFormat, format, type, param) {
    glContext.activeTexture(glContext.TEXTURE0);
    const texture = glContext.createTexture();
    glContext.bindTexture(glContext.TEXTURE_2D, texture);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, param);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MAG_FILTER, param);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, glContext.CLAMP_TO_EDGE);
    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, glContext.CLAMP_TO_EDGE);
    glContext.texImage2D(glContext.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    const fbo = glContext.createFramebuffer();
    glContext.bindFramebuffer(glContext.FRAMEBUFFER, fbo);
    glContext.framebufferTexture2D(glContext.FRAMEBUFFER, glContext.COLOR_ATTACHMENT0, glContext.TEXTURE_2D, texture, 0);
    glContext.viewport(0, 0, w, h);
    glContext.clear(glContext.COLOR_BUFFER_BIT);

    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      attach(id) {
        glContext.activeTexture(glContext.TEXTURE0 + id);
        glContext.bindTexture(glContext.TEXTURE_2D, texture);
        return id;
      },
    };
  }

  function createDoubleFBO(glContext, w, h, internalFormat, format, type, param) {
    let fbo1 = createFBO(glContext, w, h, internalFormat, format, type, param);
    let fbo2 = createFBO(glContext, w, h, internalFormat, format, type, param);
    return {
      width: w,
      height: h,
      texelSizeX: fbo1.texelSizeX,
      texelSizeY: fbo1.texelSizeY,
      get read() { return fbo1; },
      set read(value) { fbo1 = value; },
      get write() { return fbo2; },
      set write(value) { fbo2 = value; },
      swap() {
        const temp = fbo1;
        fbo1 = fbo2;
        fbo2 = temp;
      },
    };
  }
}
