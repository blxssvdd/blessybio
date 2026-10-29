/**
 * blessy!! • Interactive Portfolio Engine (High-Performance Edition)
 */

// ==========================================================================
// 1. Optimized WebGL Gradient Mesh Shader Canvas
// ==========================================================================
(function initShaderCanvas() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  // Use low-power context without unnecessary alpha/depth/stencil buffers
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'low-power'
  }) || canvas.getContext('experimental-webgl');

  if (!gl) {
    init2DFallback(canvas);
    return;
  }

  const vsSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  // Medium precision and streamlined 2-layer noise for maximum FPS
  const fsSource = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_mouse;

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy) );
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m;
      m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      float aspect = u_resolution.x / u_resolution.y;
      vec2 p = uv;
      p.x *= aspect;

      float t = u_time * 0.18;
      vec2 m = u_mouse * 0.05;

      vec3 colCanvas = vec3(0.952, 0.956, 0.964);  // #f3f4f6
      vec3 colCyan   = vec3(0.592, 0.902, 1.000);  // #97e6ff
      vec3 colSky    = vec3(0.780, 0.859, 1.000);  // #c7dbff
      vec3 colBlue   = vec3(0.000, 0.333, 1.000);  // #0055ff

      float n1 = snoise(p * 0.85 + vec2(t * 0.4, -t * 0.3) + m);
      float n2 = snoise(p * 1.5 - vec2(t * 0.3, t * 0.5) + vec2(n1 * 0.35));

      float wave = smoothstep(-0.6, 0.8, n1 + n2 * 0.6);
      float heroGlow = 1.0 - smoothstep(0.0, 1.4, length(uv - vec2(0.5, 0.75)));

      vec3 color = mix(colCanvas, colSky, wave * 0.45);
      color = mix(color, colCyan, clamp(n2 * 0.6 + heroGlow * 0.35, 0.0, 1.0));
      color = mix(color, colBlue, clamp(max(0.0, n1 * n2) * 0.25, 0.0, 1.0));
      color = mix(color, colCanvas, 0.25);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) {
    init2DFallback(canvas);
    return;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    init2DFallback(canvas);
    return;
  }

  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]),
    gl.STATIC_DRAW
  );

  const posLoc = gl.getAttribLocation(program, 'a_position');
  const resLoc = gl.getUniformLocation(program, 'u_resolution');
  const timeLoc = gl.getUniformLocation(program, 'u_time');
  const mouseLoc = gl.getUniformLocation(program, 'u_mouse');

  let mouseX = 0;
  let mouseY = 0;
  let targetMouseX = 0;
  let targetMouseY = 0;

  // RAF-throttled pointer movement to prevent high-frequency mouse polling stutters
  let mousePending = false;
  let rawClientX = 0;
  let rawClientY = 0;

  window.addEventListener('pointermove', (e) => {
    rawClientX = e.clientX;
    rawClientY = e.clientY;
    if (!mousePending) {
      mousePending = true;
      requestAnimationFrame(() => {
        targetMouseX = (rawClientX / window.innerWidth) * 2 - 1;
        targetMouseY = -(rawClientY / window.innerHeight) * 2 + 1;
        mousePending = false;
      });
    }
  }, { passive: true });

  // Optimal buffer sizing: cap internal resolution for ambient soft gradient
  // Reduces fragment shader pixel invocations by ~85% with identical visual blur!
  const MAX_RES = 640;
  function resize() {
    const sw = window.innerWidth || 800;
    const sh = window.innerHeight || 600;
    const aspect = sw / Math.max(1, sh);

    let w, h;
    if (aspect >= 1) {
      w = Math.min(sw, MAX_RES);
      h = Math.round(w / aspect);
    } else {
      h = Math.min(sh, MAX_RES);
      w = Math.round(h * aspect);
    }

    w = Math.max(160, Math.min(w, MAX_RES));
    h = Math.max(160, Math.min(h, MAX_RES));

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!resizeTimer) {
      resizeTimer = requestAnimationFrame(() => {
        resize();
        resizeTimer = null;
      });
    }
  }, { passive: true });
  resize();

  let startTime = performance.now();
  let animationFrameId = null;
  let isRunning = true;

  // Target 50 FPS frame-pacing to avoid runaway 144Hz/240Hz monitor GPU drain
  const FRAME_INTERVAL = 1000 / 50;
  let lastFrameTime = 0;

  function render(now) {
    if (!isRunning) return;
    animationFrameId = requestAnimationFrame(render);

    const delta = now - lastFrameTime;
    if (delta < FRAME_INTERVAL) return;
    lastFrameTime = now - (delta % FRAME_INTERVAL);

    const elapsed = (now - startTime) * 0.001;

    // Smooth mouse lerp
    mouseX += (targetMouseX - mouseX) * 0.04;
    mouseY += (targetMouseY - mouseY) * 0.04;

    gl.useProgram(program);
    gl.enableVertexAttribArray(posLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(resLoc, canvas.width, canvas.height);
    gl.uniform1f(timeLoc, elapsed);
    gl.uniform2f(mouseLoc, mouseX, mouseY);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // Auto-pause when tab is hidden or backgrounded
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      isRunning = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    } else {
      if (!isRunning) {
        isRunning = true;
        lastFrameTime = performance.now();
        animationFrameId = requestAnimationFrame(render);
      }
    }
  });

  // Respect prefers-reduced-motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    render(startTime);
    isRunning = false;
  } else {
    animationFrameId = requestAnimationFrame(render);
  }
})();

// Graceful 2D Fallback
function init2DFallback(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  function draw() {
    canvas.width = Math.min(window.innerWidth, 640);
    canvas.height = Math.min(window.innerHeight, 480);
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#f3f4f6');
    grad.addColorStop(0.5, '#e4effa');
    grad.addColorStop(1, '#f3f4f6');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', draw, { passive: true });
  draw();
}

// ==========================================================================
// 2. Navigation Header & Debounced Scroll Elevation
// ==========================================================================
(function initNav() {
  const burger = document.querySelector('.burger');
  const navLinks = document.querySelector('.nav-links');

  // RAF-debounced scroll detection (only touches DOM when state crosses threshold)
  let isScrolled = false;
  let scrollTicking = false;

  const checkScroll = () => {
    if (!scrollTicking) {
      scrollTicking = true;
      requestAnimationFrame(() => {
        const shouldBeScrolled = window.scrollY > 20;
        if (shouldBeScrolled !== isScrolled) {
          isScrolled = shouldBeScrolled;
          document.body.classList.toggle('scrolled', isScrolled);
        }
        scrollTicking = false;
      });
    }
  };
  window.addEventListener('scroll', checkScroll, { passive: true });
  checkScroll();

  // Mobile menu toggle
  if (burger && navLinks) {
    burger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navLinks.classList.toggle('open');
      burger.classList.toggle('active', isOpen);
    });

    document.addEventListener('click', (e) => {
      if (!navLinks.contains(e.target) && !burger.contains(e.target)) {
        navLinks.classList.remove('open');
        burger.classList.remove('active');
      }
    });

    navLinks.addEventListener('click', (e) => {
      if (e.target.closest('.nav-link')) {
        navLinks.classList.remove('open');
        burger.classList.remove('active');
      }
    });
  }
})();

// ==========================================================================
// 3. Split Action Button (.ha-split) Caret Dropdown
// ==========================================================================
(function initSplitButton() {
  const carets = document.querySelectorAll('.ha-caret');
  carets.forEach((caret) => {
    const parent = caret.closest('.ha-split');
    const menu = parent ? parent.querySelector('.ha-menu') : null;
    if (!menu) return;

    caret.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.toggle('open');
      caret.classList.toggle('active', isOpen);
      parent.classList.toggle('is-open', isOpen);
    });

    document.addEventListener('click', (e) => {
      if (!parent.contains(e.target)) {
        menu.classList.remove('open');
        caret.classList.remove('active');
        parent.classList.remove('is-open');
      }
    });
  });
})();

// ==========================================================================
// 4. FAQ Accordion
// ==========================================================================
(function initFAQ() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach((item) => {
    const question = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');
    if (!question || !answer) return;

    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      // Close other items
      faqItems.forEach((other) => {
        if (other !== item) {
          other.classList.remove('open');
          const otherAns = other.querySelector('.faq-answer');
          if (otherAns) otherAns.style.maxHeight = null;
        }
      });

      if (isOpen) {
        item.classList.remove('open');
        answer.style.maxHeight = null;
      } else {
        item.classList.add('open');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });
})();

// ==========================================================================
// 5. Project Filters
// ==========================================================================
(function initProjectFilters() {
  const filterBtns = document.querySelectorAll('[data-project-filter]');
  const projects = document.querySelectorAll('.projects-grid .project-card');
  if (!filterBtns.length || !projects.length) return;

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.getAttribute('data-project-filter');
      projects.forEach((proj) => {
        const cat = proj.getAttribute('data-category');
        if (filter === 'all' || cat === filter) {
          proj.style.display = 'flex';
        } else {
          proj.style.display = 'none';
        }
      });
    });
  });
})();

// ==========================================================================
// 6. Gallery Filters & Robust Lightbox
// ==========================================================================
(function initGallery() {
  const filterBtns = document.querySelectorAll('[data-filter]');
  const items = document.querySelectorAll('.gallery-item');
  const lightbox = document.getElementById('lightbox');

  // Filter tabs
  if (filterBtns.length && items.length) {
    filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        filterBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.getAttribute('data-filter');
        items.forEach((item) => {
          const cat = item.getAttribute('data-category');
          if (filter === 'all' || cat === filter) {
            item.style.display = 'block';
          } else {
            item.style.display = 'none';
          }
        });
      });
    });
  }

  // Lightbox
  if (lightbox) {
    const lbImg = lightbox.querySelector('.lb-img');
    const lbCap = lightbox.querySelector('.lb-caption');
    const lbCounter = lightbox.querySelector('.lb-counter');
    const lbClose = lightbox.querySelector('.lb-close');
    const lbPrev = lightbox.querySelector('.lb-prev');
    const lbNext = lightbox.querySelector('.lb-next');

    let visibleItems = [];
    let currentLbIndex = 0;

    const updateLightboxContent = () => {
      if (!visibleItems.length) return;
      const target = visibleItems[currentLbIndex];
      const img = target.querySelector('img');
      const cap = target.querySelector('figcaption');

      if (lbImg && img) {
        lbImg.src = img.src;
        lbImg.alt = img.alt || '';
      }
      if (lbCap) {
        lbCap.textContent = cap ? cap.textContent : '';
      }
      if (lbCounter) {
        lbCounter.textContent = `${currentLbIndex + 1} / ${visibleItems.length}`;
      }
    };

    const openLightbox = (index) => {
      visibleItems = Array.from(items).filter((it) => it.style.display !== 'none');
      if (!visibleItems.length) {
        visibleItems = Array.from(items);
      }
      currentLbIndex = (index + visibleItems.length) % visibleItems.length;
      updateLightboxContent();

      lightbox.classList.add('active');
      document.body.style.overflow = 'hidden';
    };

    const closeLightbox = () => {
      lightbox.classList.remove('active');
      document.body.style.overflow = '';
    };

    const nextImage = () => {
      if (!visibleItems.length) return;
      currentLbIndex = (currentLbIndex + 1) % visibleItems.length;
      updateLightboxContent();
    };

    const prevImage = () => {
      if (!visibleItems.length) return;
      currentLbIndex = (currentLbIndex - 1 + visibleItems.length) % visibleItems.length;
      updateLightboxContent();
    };

    // Attach click to all gallery items
    items.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        visibleItems = Array.from(items).filter((it) => it.style.display !== 'none');
        if (!visibleItems.length) visibleItems = Array.from(items);
        const idx = visibleItems.indexOf(item);
        openLightbox(idx !== -1 ? idx : 0);
      });
    });

    // Support preview for profile photo in about.html
    const profilePhoto = document.querySelector('.about-photo-inner img');
    if (profilePhoto && !items.length) {
      profilePhoto.style.cursor = 'zoom-in';
      profilePhoto.addEventListener('click', () => {
        if (lbImg) {
          lbImg.src = profilePhoto.src;
          lbImg.alt = profilePhoto.alt || '';
        }
        if (lbCap) {
          lbCap.textContent = 'blessy!! • Developer';
        }
        if (lbCounter) lbCounter.textContent = '';
        if (lbPrev) lbPrev.style.display = 'none';
        if (lbNext) lbNext.style.display = 'none';
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
      });
    }

    if (lbClose) {
      lbClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closeLightbox();
      });
    }

    if (lbPrev) {
      lbPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        prevImage();
      });
    }

    if (lbNext) {
      lbNext.addEventListener('click', (e) => {
        e.stopPropagation();
        nextImage();
      });
    }

    // Backdrop click: close if clicking outside image and controls
    lightbox.addEventListener('click', (e) => {
      const clickedControl = e.target.closest('.lb-prev, .lb-next, .lb-close, .lb-img');
      if (!clickedControl) {
        closeLightbox();
      }
    });

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('active')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') prevImage();
      if (e.key === 'ArrowRight') nextImage();
    });

    // Touch swipe support
    let touchStartX = 0;
    let touchStartY = 0;
    lightbox.addEventListener('touchstart', (e) => {
      if (!e.touches.length) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    lightbox.addEventListener('touchend', (e) => {
      if (!e.changedTouches.length) return;
      const deltaX = e.changedTouches[0].clientX - touchStartX;
      const deltaY = e.changedTouches[0].clientY - touchStartY;

      if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX > 0) {
          prevImage();
        } else {
          nextImage();
        }
      } else if (deltaY > 90) {
        closeLightbox();
      }
    }, { passive: true });
  }
})();

// ==========================================================================
// 7. Optimized Audio Engine
// ==========================================================================
(function initAudioPlayer() {
  const cards = document.querySelectorAll('.track-card');
  if (!cards.length) return;

  const audio = document.createElement('audio');
  audio.preload = 'none'; // Lazy audio loading: don't preload stream before user interaction
  audio.hidden = true;
  document.body.appendChild(audio);

  const nowPlayingBanner = document.querySelector('.now-playing-banner');
  const nowPlayingDisc = document.querySelector('.now-playing-disc');
  const nowPlayingTitle = document.querySelector('.now-playing-title');
  const nowPlayingArtist = document.querySelector('.now-playing-artist');

  let currentIndex = -1;
  let volume = 0.8;
  let seeking = false;
  let lastSecond = -1;

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || isNaN(seconds)) return '0:00';
    const total = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const trackStates = Array.from(cards).map((card, index) => {
    return {
      card,
      index,
      src: card.getAttribute('data-track-src') || '',
      playBtn: card.querySelector('.play-btn'),
      prevBtn: card.querySelector('.prev-btn'),
      nextBtn: card.querySelector('.next-btn'),
      slider: card.querySelector('.track-slider'),
      currentEl: card.querySelector('.time-current'),
      durationEl: card.querySelector('.time-duration'),
      volumeSlider: card.querySelector('.volume-slider'),
      title: card.querySelector('.track-title')?.textContent || 'Track',
      artist: card.querySelector('.track-artist')?.textContent || 'Artist',
    };
  });

  const updateCardUI = () => {
    trackStates.forEach((state) => {
      const isActive = state.index === currentIndex;
      const isPlaying = isActive && !audio.paused && audio.currentTime > 0;

      state.card.classList.toggle('active-track', isActive);
      if (state.playBtn) {
        state.playBtn.innerHTML = isPlaying
          ? '<i class="fa-solid fa-pause"></i>'
          : '<i class="fa-solid fa-play"></i>';
      }

      if (!isActive) {
        if (state.slider) state.slider.value = 0;
        if (state.currentEl) state.currentEl.textContent = '0:00';
      }
    });

    if (nowPlayingDisc) {
      if (!audio.paused && audio.currentTime > 0) {
        nowPlayingDisc.classList.add('playing');
      } else {
        nowPlayingDisc.classList.remove('playing');
      }
    }

    if (currentIndex >= 0 && trackStates[currentIndex]) {
      const current = trackStates[currentIndex];
      if (nowPlayingTitle) nowPlayingTitle.textContent = current.title;
      if (nowPlayingArtist) nowPlayingArtist.textContent = current.artist;
    }
  };

  const loadTrack = (index, autoPlay = true) => {
    if (index < 0 || index >= trackStates.length) return;
    const state = trackStates[index];
    if (!state.src) return;

    currentIndex = index;
    lastSecond = -1;
    audio.src = encodeURI(state.src);
    audio.load();

    if (autoPlay) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Playback notice:', err);
          updateCardUI();
        });
      }
    }
    updateCardUI();
  };

  const stepTrack = (direction) => {
    if (trackStates.length === 0) return;
    let nextIdx = (currentIndex + direction + trackStates.length) % trackStates.length;
    loadTrack(nextIdx, true);
  };

  // Now Playing Banner click toggles play/pause
  if (nowPlayingBanner) {
    nowPlayingBanner.addEventListener('click', () => {
      if (currentIndex === -1) {
        loadTrack(0, true);
      } else {
        if (audio.paused) {
          audio.play().catch(() => {});
        } else {
          audio.pause();
        }
      }
    });
  }

  trackStates.forEach((state) => {
    if (!state.src) return;

    if (state.playBtn) {
      state.playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.index === currentIndex) {
          if (audio.paused) {
            audio.play().catch(() => {});
          } else {
            audio.pause();
          }
        } else {
          loadTrack(state.index, true);
        }
      });
    }

    if (state.prevBtn) {
      state.prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        stepTrack(-1);
      });
    }

    if (state.nextBtn) {
      state.nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        stepTrack(1);
      });
    }

    if (state.slider) {
      state.slider.addEventListener('pointerdown', () => { seeking = true; });
      state.slider.addEventListener('pointerup', () => { seeking = false; });

      state.slider.addEventListener('input', () => {
        if (state.index !== currentIndex || !Number.isFinite(audio.duration)) return;
        const time = (state.slider.value / 100) * audio.duration;
        if (state.currentEl) state.currentEl.textContent = formatTime(time);
      });

      state.slider.addEventListener('change', () => {
        if (state.index !== currentIndex || !Number.isFinite(audio.duration)) return;
        audio.currentTime = (state.slider.value / 100) * audio.duration;
        seeking = false;
      });
    }

    if (state.volumeSlider) {
      state.volumeSlider.value = Math.round(volume * 100);
      state.volumeSlider.addEventListener('input', (e) => {
        volume = Number(e.target.value) / 100;
        audio.volume = Math.max(0, Math.min(1, volume));
        trackStates.forEach((s) => {
          if (s.volumeSlider && s.volumeSlider !== e.target) {
            s.volumeSlider.value = e.target.value;
          }
        });
      });
    }
  });

  // Optimized timeupdate: throttles DOM string mutations to 1 update per whole second
  audio.addEventListener('timeupdate', () => {
    if (currentIndex < 0 || seeking) return;
    const state = trackStates[currentIndex];
    if (!state) return;

    const dur = audio.duration;
    if (Number.isFinite(dur) && dur > 0) {
      const curTime = audio.currentTime;
      const pct = (curTime / dur) * 100;
      if (state.slider) state.slider.value = pct;

      const sec = Math.floor(curTime);
      if (sec !== lastSecond) {
        lastSecond = sec;
        if (state.currentEl) state.currentEl.textContent = formatTime(curTime);
      }
    }
  });

  // Duration only updated on metadata load once
  audio.addEventListener('loadedmetadata', () => {
    if (currentIndex < 0) return;
    const state = trackStates[currentIndex];
    if (state && state.durationEl && Number.isFinite(audio.duration)) {
      state.durationEl.textContent = formatTime(audio.duration);
    }
  });

  audio.addEventListener('play', updateCardUI);
  audio.addEventListener('pause', updateCardUI);
  audio.addEventListener('ended', () => stepTrack(1));
  audio.addEventListener('error', (err) => {
    console.warn('Audio playback error:', err);
    updateCardUI();
  });
})();

// ==========================================================================
// 8. Toast Micro-interaction Utility
// ==========================================================================
window.showToast = function (msg) {
  let toast = document.querySelector('.toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<i class="fa-solid fa-check" style="color: var(--accent-cyan)"></i> <span>${msg}</span>`;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
};
