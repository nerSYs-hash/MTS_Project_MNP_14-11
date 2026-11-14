import React, { useState, useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import { PearlAnimationMode } from '../types';

type DockSide = 'right' | 'left' | 'floating';
type IdleShowStage =
  | 'none'
  | 'horiz_spin'
  | 'multi_orbits'
  | 'loop_flight'
  | 'docked_musical_wave'
  | 'docked_whip_catch';

// Углы для полукруга у края экрана (в градусах от нормали к краю)
const ARC_ANGLES_DEG = [-63, -21, 21, 63];
const ARC_RADIUS_DOCKED = 76;
const ORBIT_RADIUS_FLOATING = 72;

// Базовые стартовые параметры для Анимации 1 (асинхронное 3D-вращение со случайной сменой траекторий)
const HORIZ_SPIN_SPEEDS = [2.2, 3.05, 3.95, 4.9];
const HORIZ_SPIN_RADII = [66, 74, 82, 90];

// Параметры для Анимации 2 (выталкивание по одному на разные прорисовываемые орбиты)
const MULTI_ORBIT_RADII = [58, 82, 106, 130];
const MULTI_ORBIT_SPEEDS = [2.65, 1.9, 1.38, 0.95];
const MULTI_ORBIT_PUSH_TIMES = [0.6, 1.5, 2.4, 3.3];

// Порог отлипания от края (px) и порог прилипания к краю (px)
const PEEL_THRESHOLD_PX = 118;
const SNAP_THRESHOLD_PX = 52;

// Случайный интервал от 1 до 5 минут (60..300 секунд) для свободного парения
const getRandomIdleIntervalSec = () => 60 + Math.random() * 240;

// Хаотичный интервал для музыкальной волны бусин, когда жемчужина спокойно прикреплена к краю
const getRandomDockedWaveIntervalSec = () =>
  Math.random() < 0.35 ? 7 + Math.random() * 6 : 14 + Math.random() * 46;

// Параметры 112 лёгких перламутровых песчинок (28 на каждый шарик), которые растворяют шарики на первой волне и собирают их обратно прямо из воздуха в конце
const PEARL_SAND_GRAINS = Array.from({ length: 112 }, (_, m) => ({
  targetBead: m % 4,
  // Золотое сечение для равномерного облачка песчинок в воздухе вокруг каждого шарика
  spawnAngle: (m * 2.399963) % (Math.PI * 2),
  spawnDist: 14 + ((m * 19) % 34), // 14..47px в воздухе вокруг точки сборки шарика
  driftCurve: (m % 2 === 0 ? 1 : -1) * (0.22 + ((m * 7) % 9) * 0.04),
  stagger: ((m * 13) % 22) * 0.013, // 0..0.27с разброс по времени для живого потока песчинок
  radius: 0.85 + (m % 4) * 0.32, // Тонкие изящные песчинки (0.85px .. 1.81px)
  tintIndex: m % 4, // 0 = чистый жемчуг, 1 = нежно-голубой перламутр, 2 = нежно-розовый перламутр, 3 = лавандовый перламутр
}));

export interface EdgeQuickDockProps {
  onOpenBook?: () => void;
  animationMode?: PearlAnimationMode;
}

export const EdgeQuickDock: React.FC<EdgeQuickDockProps> = ({
  onOpenBook,
  animationMode = 'auto',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dockSide, setDockSide] = useState<DockSide>('right');
  const [isStretchingSlime, setIsStretchingSlime] = useState(false);
  const [isIdleShowActive, setIsIdleShowActive] = useState(false);
  const [isMovingFast, setIsMovingFast] = useState(false);
  const [crossRevealCycle, setCrossRevealCycle] = useState(0);
  const [isBookActivePulse, setIsBookActivePulse] = useState(false);

  // Ссылки на DOM-узлы для 60fps физической анимации без лишних ререндеров
  const mainBtnRef = useRef<HTMLButtonElement | null>(null);
  const mainGooRef = useRef<HTMLDivElement | null>(null);
  const wallPadRef = useRef<HTMLDivElement | null>(null);
  const neck1Ref = useRef<HTMLDivElement | null>(null);
  const neck2Ref = useRef<HTMLDivElement | null>(null);

  const dropletBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dropletGooRefs = useRef<(HTMLDivElement | null)[]>([]);
  const bridgeGooRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Ссылки на SVG-кольца прорисовываемых орбит (для Анимации 2) и верхний слой преломления линий сквозь капли
  const orbitOverlayRef = useRef<HTMLDivElement | null>(null);
  const orbitThroughOverlayRef = useRef<HTMLDivElement | null>(null);
  const orbitCircleRefs = useRef<(SVGCircleElement | null)[]>([]);
  const orbitInnerArcRefs = useRef<(SVGPathElement | null)[]>([]);
  const orbitInnerCoreRefs = useRef<(SVGPathElement | null)[]>([]);
  const orbitEntryDotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const orbitExitDotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Физическое состояние в ref
  const physRef = useRef({
    dockSide: 'right' as DockSide,
    isOpen: false,
    isDragging: false,
    dragMoved: false,
    pointerStartX: 0,
    pointerStartY: 0,
    dragStartBtnY: typeof window !== 'undefined' ? window.innerHeight / 2 : 450,
    grabOffsetX: 0,
    grabOffsetY: 0,
    pullDist: 0,
    lastMoveTime: 0,
    lastClientX: 0,
    lastClientY: 0,
    throwVx: 0,
    throwVy: 0,
    freeVx: 0,
    freeVy: 0,
    prevVx: 0,
    prevVy: 0,
    mouseX: typeof window !== 'undefined' ? window.innerWidth : 1200,
    mouseY: typeof window !== 'undefined' ? window.innerHeight / 2 : 450,
    // Текущие сглаженные координаты центра главной кнопки
    x: typeof window !== 'undefined' ? window.innerWidth : 1200,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 450,
    // Пружина деформации (squash & stretch лизуна + инерция жидкости при покачивании)
    scaleX: 1,
    scaleY: 1,
    velScaleX: 0,
    velScaleY: 0,
    // Инерционное колыхание капли при резком движении из стороны в сторону
    sloshX: 0,
    sloshY: 0,
    velSloshX: 0,
    velSloshY: 0,
    // Временный импульс прилипания к стене (0..1)
    splatTimer: 0,
    splatWallX: 0,
    // Угол расположения шариков в свободном состоянии (диагональю, как на скриншоте)
    orbitAngle: -Math.PI * 0.72,
    wasMovingFast: false,
    // Состояние автономных анимаций (1 -> 2 -> 3 в свободном парении, или docked_musical_wave / docked_whip_catch у стены)
    idleStage: 'none' as IdleShowStage,
    idleStageTime: 0,
    // Первый показ запускается через ~7 сек после отрыва от стены, далее случайно каждые 1–5 минут (60..300 сек)
    nextIdleWaitSec: 7,
    // Таймер до следующей анимации у стены (побег шарика с захватом хлыстом или воздушные волны с песчинками)
    nextDockedWaveWaitSec: 2.8,
    lastDockedStage: 'none' as 'none' | 'docked_musical_wave' | 'docked_whip_catch',
    waveDirection: 1,
    waveTempo: 1,
    // Параметры анимации побега шарика и захвата хлыстом (docked_whip_catch) по разным нелинейным траекториям
    whipTargetIdx: 0,
    requestedWhipTarget: null as number | null,
    whipTrajectoryType: 0, // 0..4 — 5 разных типов криволинейных траекторий побега
    lastWhipTrajectory: -1,
    whipEscapeDist: 380,
    whipEscapeAngleDeg: 0,
    whipCurveSign: 1,
    whipLateralAmp: 110,
    whipSecondaryAmp: 65,
    whipLungeTriggered: false,
    whipCatchTriggered: false,
    whipYankTriggered: false,
    whipReturnTriggered: false,
    animationMode: animationMode as PearlAnimationMode,
    customAngles: [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5],
    pushedFlags: [false, false, false, false],
    // Индивидуальные асинхронные 3D-орбиты каждой капли со случайной сменой наклона, радиуса и скорости
    spinOrbits: [0, 1, 2, 3].map((i) => ({
      angle: (i * Math.PI) / 2,
      speed: HORIZ_SPIN_SPEEDS[i],
      targetSpeed: HORIZ_SPIN_SPEEDS[i],
      tilt: (i - 1.5) * 0.24,
      targetTilt: (i - 1.5) * 0.24,
      radiusX: HORIZ_SPIN_RADII[i],
      targetRadiusX: HORIZ_SPIN_RADII[i],
      radiusY: 14 + i * 3,
      targetRadiusY: 14 + i * 3,
      offsetY: (i - 1.5) * 7,
      targetOffsetY: (i - 1.5) * 7,
      changeTimer: 0.9 + i * 0.55,
    })),
    // Индивидуальные асинхронные скорости на кольцах Анимации 2 (multi_orbits)
    multiOrbitDyn: [0, 1, 2, 3].map((i) => ({
      speed: MULTI_ORBIT_SPEEDS[i],
      targetSpeed: MULTI_ORBIT_SPEEDS[i],
      changeTimer: 1.4 + i * 0.65,
    })),
    loopOriginX: 600,
    loopOriginY: 450,
    loopFlightRadiusX: 68,
    loopFlightRadiusY: 60,
    loopFlightTilt: 0,
    loopFlightDir: 1,
    loopFlightLobe: 1,
    gulpedFlags: [false, false, false, false],
    loopReleaseTriggered: false,
    requestedNextStage: null as IdleShowStage | null,
    // Мировые координаты и скорости (wx, wy, vx, vy, scale) каждого из 4 шариков на «невидимых лесках»
    droplets: [
      {
        wx: typeof window !== 'undefined' ? window.innerWidth : 1200,
        wy: typeof window !== 'undefined' ? window.innerHeight / 2 : 450,
        vx: 0,
        vy: 0,
        scale: 0,
      },
      {
        wx: typeof window !== 'undefined' ? window.innerWidth : 1200,
        wy: typeof window !== 'undefined' ? window.innerHeight / 2 : 450,
        vx: 0,
        vy: 0,
        scale: 0,
      },
      {
        wx: typeof window !== 'undefined' ? window.innerWidth : 1200,
        wy: typeof window !== 'undefined' ? window.innerHeight / 2 : 450,
        vx: 0,
        vy: 0,
        scale: 0,
      },
      {
        wx: typeof window !== 'undefined' ? window.innerWidth : 1200,
        wy: typeof window !== 'undefined' ? window.innerHeight / 2 : 450,
        vx: 0,
        vy: 0,
        scale: 0,
      },
    ],
  });

  // Синхронизация выбранного в настройках режима анимации свободной Жемчужины
  useEffect(() => {
    const p = physRef.current;
    p.animationMode = animationMode;
    if (p.dockSide === 'floating') {
      if (animationMode === 'loop_horiz_spin' && p.idleStage !== 'horiz_spin') {
        p.requestedNextStage = 'horiz_spin';
      } else if (animationMode === 'loop_multi_orbits' && p.idleStage !== 'multi_orbits') {
        p.requestedNextStage = 'multi_orbits';
      } else if (animationMode === 'loop_flight' && p.idleStage !== 'loop_flight') {
        p.requestedNextStage = 'loop_flight';
      }
    }
  }, [animationMode]);

  // Синхронизация React-состояния с физическим ref
  useEffect(() => {
    physRef.current.isOpen = isOpen;
    if (isOpen && physRef.current.dockSide !== 'floating') {
      // После раскрытия бусин у края первая анимация запускается через ~2.8 сек спокойствия, далее хаотично
      physRef.current.nextDockedWaveWaitSec = 2.6 + Math.random() * 1.2;
    } else if (
      !isOpen &&
      (physRef.current.idleStage === 'docked_musical_wave' ||
        physRef.current.idleStage === 'docked_whip_catch')
    ) {
      physRef.current.requestedNextStage = 'none';
    }
  }, [isOpen]);

  useEffect(() => {
    physRef.current.dockSide = dockSide;
  }, [dockSide]);

  // Главный цикл физики 60fps (лизун + живая капля при тряске + полёт от толчка + шарики на невидимых лесках + шоу-анимации)
  useEffect(() => {
    let rafId: number;
    let lastTime = performance.now();

    const clearOrbitPassThroughElements = () => {
      for (let i = 0; i < 4; i++) {
        const arcEl = orbitInnerArcRefs.current[i];
        const coreEl = orbitInnerCoreRefs.current[i];
        const enEl = orbitEntryDotRefs.current[i];
        const exEl = orbitExitDotRefs.current[i];
        if (arcEl) arcEl.style.opacity = '0';
        if (coreEl) coreEl.style.opacity = '0';
        if (enEl) enEl.style.opacity = '0';
        if (exEl) exEl.style.opacity = '0';
      }
    };

    const stopIdleShow = () => {
      const p = physRef.current;
      const wasActive = p.idleStage !== 'none';
      p.idleStage = 'none';
      p.idleStageTime = 0;
      p.pushedFlags = [false, false, false, false];
      p.gulpedFlags = [false, false, false, false];
      if (wasActive) {
        setIsIdleShowActive(false);
        setCrossRevealCycle((prev) => prev + 1);
      }
      for (let i = 0; i < 4; i++) {
        const cEl = orbitCircleRefs.current[i];
        if (cEl) {
          cEl.style.opacity = '0';
        }
        const bEl = dropletBtnRefs.current[i];
        if (bEl) {
          bEl.style.zIndex = '10';
        }
      }
      clearOrbitPassThroughElements();
      if (waveCanvasRef.current) {
        const ctx = waveCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, waveCanvasRef.current.width, waveCanvasRef.current.height);
        }
      }
    };

    const startIdleStage = (stage: IdleShowStage) => {
      const p = physRef.current;
      const w = window.innerWidth;
      const h = window.innerHeight;
      p.idleStage = stage;
      p.idleStageTime = 0;
      p.pushedFlags = [false, false, false, false];
      p.gulpedFlags = [false, false, false, false];
      p.loopReleaseTriggered = false;
      setIsIdleShowActive(stage !== 'none');
      clearOrbitPassThroughElements();

      if (stage === 'horiz_spin') {
        for (let i = 0; i < 4; i++) {
          const cEl = orbitCircleRefs.current[i];
          if (cEl) cEl.style.opacity = '0';
          const baseAngle = p.orbitAngle + (i * Math.PI) / 2 + (Math.random() - 0.5) * 0.45;
          p.customAngles[i] = baseAngle;
          const initSpeed = 1.9 + Math.random() * 2.6;
          const initTilt = (Math.random() - 0.5) * 1.45;
          const initRx = 60 + Math.random() * 34;
          const initRy = 12 + Math.random() * 15;
          const initOffY = (Math.random() - 0.5) * 24;
          p.spinOrbits[i] = {
            angle: baseAngle,
            speed: initSpeed,
            targetSpeed: 1.7 + Math.random() * 2.9,
            tilt: initTilt,
            targetTilt: (Math.random() - 0.5) * 1.65,
            radiusX: initRx,
            targetRadiusX: 58 + Math.random() * 38,
            radiusY: initRy,
            targetRadiusY: 11 + Math.random() * 18,
            offsetY: initOffY,
            targetOffsetY: (Math.random() - 0.5) * 28,
            changeTimer: 0.7 + Math.random() * 1.6,
          };
        }
      } else if (stage === 'multi_orbits') {
        for (let i = 0; i < 4; i++) {
          p.customAngles[i] = (i * Math.PI) / 2 + (Math.random() - 0.5) * 0.35;
          p.multiOrbitDyn[i] = {
            speed: MULTI_ORBIT_SPEEDS[i] * (0.85 + Math.random() * 0.35),
            targetSpeed: MULTI_ORBIT_SPEEDS[i] * (0.75 + Math.random() * 0.55),
            changeTimer: 1.2 + Math.random() * 2.1,
          };
          const cEl = orbitCircleRefs.current[i];
          if (cEl) {
            const circum = 2 * Math.PI * MULTI_ORBIT_RADII[i];
            cEl.style.strokeDasharray = `${circum.toFixed(1)}`;
            cEl.style.strokeDashoffset = `${circum.toFixed(1)}`;
            cEl.style.opacity = '0';
          }
        }
      } else if (stage === 'loop_flight') {
        for (let i = 0; i < 4; i++) {
          const cEl = orbitCircleRefs.current[i];
          if (cEl) {
            cEl.style.opacity = '0';
          }
          const bEl = dropletBtnRefs.current[i];
          if (bEl) {
            bEl.style.zIndex = '10';
          }
        }
        p.loopOriginX = Math.max(105, Math.min(w - 105, p.x));
        p.loopOriginY = Math.max(115, Math.min(h - 115, p.y));
        // Случайная траектория облёта при каждом запуске (разный радиус, наклон и форма виража)
        p.loopFlightRadiusX = 54 + Math.random() * 34;
        p.loopFlightRadiusY = 42 + Math.random() * 34;
        p.loopFlightTilt = (Math.random() - 0.5) * Math.PI * 0.85;
        p.loopFlightDir = Math.random() < 0.5 ? 1 : -1;
        p.loopFlightLobe = Math.random() < 0.45 ? 2 : 1;
      } else if (stage === 'docked_musical_wave') {
        p.lastDockedStage = 'docked_musical_wave';
        p.waveDirection = Math.random() < 0.5 ? 1 : -1;
        p.waveTempo = 0.92 + Math.random() * 0.24;
      } else if (stage === 'docked_whip_catch') {
        p.lastDockedStage = 'docked_whip_catch';
        const chosenIdx =
          p.requestedWhipTarget !== null ? p.requestedWhipTarget : Math.floor(Math.random() * 4);
        p.requestedWhipTarget = null;
        p.whipTargetIdx = chosenIdx;

        // Выбираем каждый раз новую криволинейную траекторию побега (0..4), чтобы попытки всегда шли по разным путям
        const nextTraj = (p.lastWhipTrajectory + 1 + Math.floor(Math.random() * 4)) % 5;
        p.whipTrajectoryType = nextTraj;
        p.lastWhipTrajectory = nextTraj;

        // Шарик улетает значительно дальше вглубь экрана (340..430px, с учётом ширины окна)
        p.whipEscapeDist = Math.min(Math.max(280, w * 0.62), 340 + Math.random() * 90);

        // Выбираем направление дальнего броска и сторону изгиба дуги (с защитой от краёв экрана сверху/снизу)
        const nearTop = p.y < 250;
        const nearBottom = p.y > h - 250;
        const baseSpreadDeg = (Math.random() - 0.5) * 76; // -38° .. +38°
        p.whipEscapeAngleDeg = nearTop
          ? 18 + Math.random() * 34
          : nearBottom
            ? -(18 + Math.random() * 34)
            : ARC_ANGLES_DEG[chosenIdx] * 0.35 + baseSpreadDeg;

        p.whipCurveSign = nearTop ? 1 : nearBottom ? -1 : Math.random() < 0.5 ? 1 : -1;
        p.whipLateralAmp = 96 + Math.random() * 52; // 96..148px размах бокового виража
        p.whipSecondaryAmp = 54 + Math.random() * 36; // 54..90px для петель и контр-виражей

        p.whipLungeTriggered = false;
        p.whipCatchTriggered = false;
        p.whipYankTriggered = false;
        p.whipReturnTriggered = false;
      }
    };

    // Вычисление точки (dx, dy) относительно жемчужины на криволинейной траектории побега шарика (u = 0..1)
    const evalWhipEscapePoint = (uRaw: number) => {
      const p = physRef.current;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const u = Math.max(0, Math.min(1.12, uRaw));
      const dirX = p.dockSide === 'right' ? -1 : 1;

      const startRad = (ARC_ANGLES_DEG[p.whipTargetIdx] * Math.PI) / 180;
      const startDx = dirX * Math.cos(startRad) * ARC_RADIUS_DOCKED;
      const startDy = Math.sin(startRad) * ARC_RADIUS_DOCKED;

      const endRad = (p.whipEscapeAngleDeg * Math.PI) / 180;
      const endDx = dirX * Math.cos(endRad) * p.whipEscapeDist;
      const endDy = Math.sin(endRad) * p.whipEscapeDist;

      const chordX = endDx - startDx;
      const chordY = endDy - startDy;
      const chordLen = Math.hypot(chordX, chordY) || 1;
      const ux = chordX / chordLen;
      const uy = chordY / chordLen;
      // Перпендикуляр к хорде для нелинейных дуг, петель и зигзагов
      const nx = -uy * p.whipCurveSign;
      const ny = ux * p.whipCurveSign;

      let forward = u;
      let lat = 0;
      const uClamped = Math.min(1, u);

      switch (p.whipTrajectoryType) {
        case 0: {
          // Траектория 0: Широкий S-образный слалом (шарик резко ныряет в одну сторону, затем закладывает крутой вираж в другую)
          forward = u;
          lat =
            Math.sin(uClamped * Math.PI * 2) *
            p.whipLateralAmp *
            (0.65 + 0.35 * Math.sin(uClamped * Math.PI));
          break;
        }
        case 1: {
          // Траектория 1: Крутая параболическая дуга большого радиуса с дальним уходом вглубь экрана
          forward = Math.pow(u, 0.88);
          lat = Math.sin(uClamped * Math.PI) * p.whipLateralAmp * 1.32;
          break;
        }
        case 2: {
          // Траектория 2: Воздушная спиральная петля (шарик на лету закручивает вираж-петлю и уносится вдаль)
          const loopEnv = Math.sin(uClamped * Math.PI);
          const loopTheta = uClamped * Math.PI * 2.4;
          forward = u + (Math.cos(loopTheta) - 1) * 0.14 * loopEnv;
          lat =
            Math.sin(loopTheta) * p.whipLateralAmp * 0.85 * loopEnv +
            Math.sin(uClamped * Math.PI) * p.whipSecondaryAmp * 0.55;
          break;
        }
        case 3: {
          // Траектория 3: Двойной обманный финт (резкий рывок наискосок, излом траектории в воздухе и дальний прорыв)
          forward = u + Math.sin(uClamped * Math.PI * 2) * 0.08;
          lat =
            (Math.sin(uClamped * Math.PI * 2.5) * 0.78 +
              Math.sin(uClamped * Math.PI) * 0.52) *
            p.whipLateralAmp;
          break;
        }
        default: {
          // Траектория 4: Серповидный бумеранг-занос (сначала скользит вдоль края, затем крутым крюком уходит далеко в центр экрана)
          forward = Math.pow(u, 1.48);
          lat = Math.sin(Math.pow(uClamped, 0.72) * Math.PI) * p.whipLateralAmp * 1.26;
          break;
        }
      }

      let dx = startDx + chordX * forward + nx * lat;
      let dy = startDy + chordY * forward + ny * lat;

      // Держим траекторию внутри видимой области экрана с мягким запасом от краёв
      if (dirX < 0) {
        dx = Math.min(-34, Math.max(-(w - 54), dx));
      } else {
        dx = Math.max(34, Math.min(w - 54, dx));
      }
      const absY = Math.max(58, Math.min(h - 58, p.y + dy));
      dy = absY - p.y;

      return { dx, dy };
    };

    const latchToWall = (side: 'left' | 'right', wallX: number) => {
      const p = physRef.current;
      stopIdleShow();
      p.dockSide = side;
      setDockSide(side);
      p.freeVx = 0;
      p.freeVy = 0;
      p.throwVx = 0;
      p.throwVy = 0;
      p.pullDist = 0;
      p.mouseX = wallX;
      p.mouseY = p.y;
      p.dragStartBtnY = p.y;
      p.sloshX = 0;
      p.sloshY = 0;
      p.velSloshX = 0;
      p.velSloshY = 0;
      p.splatTimer = 1;
      p.splatWallX = wallX;
      p.nextDockedWaveWaitSec = 3.6 + Math.random() * 2.0;
      setIsStretchingSlime(true);
      setTimeout(() => setIsStretchingSlime(false), 360);
      // Сочный эффект расплющивания лизуна при ударе о стену
      p.velScaleX = -3.8;
      p.velScaleY = 3.5;
    };

    const handleResize = () => {
      const p = physRef.current;
      const w = window.innerWidth;
      const h = window.innerHeight;
      p.y = Math.max(75, Math.min(h - 75, p.y));
      p.mouseY = p.y;
      if (p.dockSide === 'right' && !p.isDragging) {
        p.x = w;
        p.mouseX = w;
      } else if (p.dockSide === 'left' && !p.isDragging) {
        p.x = 0;
        p.mouseX = 0;
      }
    };

    window.addEventListener('resize', handleResize);

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const p = physRef.current;
      const w = window.innerWidth;
      const h = window.innerHeight;

      // 1. В спокойном состоянии шарики стоят неподвижно на своих местах (кружатся только во время шоу-анимаций)

      // 2. Инерционный полёт после толчка мышкой (когда кнопка отпущена в режиме floating)
      if (p.dockSide === 'floating' && !p.isDragging && p.idleStage !== 'loop_flight' && Math.hypot(p.freeVx, p.freeVy) > 4) {
        p.mouseX += p.freeVx * dt;
        p.mouseY += p.freeVy * dt;

        // Если летит в сторону стены и находится недалеко от неё (< 280px) — стена притягивает её
        if (p.mouseX < 280 && p.freeVx < -35) {
          p.freeVx -= 1150 * dt;
        } else if (p.mouseX > w - 280 && p.freeVx > 35) {
          p.freeVx += 1150 * dt;
        } else {
          // Плавное затухание скорости в воздухе
          const decay = Math.exp(-3.2 * dt);
          p.freeVx *= decay;
          p.freeVy *= decay;
        }

        // Мягкое отражение от верхней и нижней границы рабочей области
        if (p.mouseY < 75) {
          p.mouseY = 75;
          p.freeVy = Math.abs(p.freeVy) * 0.5;
        } else if (p.mouseY > h - 75) {
          p.mouseY = h - 75;
          p.freeVy = -Math.abs(p.freeVy) * 0.5;
        }

        // Если долетела до левой или правой стены — закрепляется привычной анимацией лизуна!
        if (p.mouseX <= SNAP_THRESHOLD_PX || p.x <= SNAP_THRESHOLD_PX) {
          latchToWall('left', 0);
        } else if (p.mouseX >= w - SNAP_THRESHOLD_PX || p.x >= w - SNAP_THRESHOLD_PX) {
          latchToWall('right', w);
        }
      }

      // 2B. Управление автономными шоу-анимациями в свободном режиме (1 -> 2 -> 3) И музыкальной волной у края экрана
      if (p.requestedNextStage !== null) {
        const nextSt = p.requestedNextStage;
        p.requestedNextStage = null;
        if (nextSt === 'none') {
          stopIdleShow();
          if (p.dockSide === 'floating') {
            p.nextIdleWaitSec = getRandomIdleIntervalSec();
          } else {
            p.nextDockedWaveWaitSec = getRandomDockedWaveIntervalSec();
          }
        } else {
          startIdleStage(nextSt);
        }
      }

      if (p.dockSide === 'floating' && !(p.isDragging && p.dragMoved) && Math.hypot(p.freeVx, p.freeVy) <= 12) {
        if (p.idleStage === 'docked_musical_wave' || p.idleStage === 'docked_whip_catch') {
          stopIdleShow();
        }
        const mode = p.animationMode || 'auto';
        if (mode === 'loop_horiz_spin') {
          if (p.idleStage !== 'horiz_spin') {
            startIdleStage('horiz_spin');
          } else {
            p.idleStageTime += dt;
          }
        } else if (mode === 'loop_multi_orbits') {
          if (p.idleStage !== 'multi_orbits') {
            startIdleStage('multi_orbits');
          } else {
            p.idleStageTime += dt;
          }
        } else if (mode === 'loop_flight') {
          if (p.idleStage !== 'loop_flight') {
            startIdleStage('loop_flight');
          } else {
            p.idleStageTime += dt;
            if (p.idleStageTime >= 8.65) {
              // Бесшовный перезапуск облёта с новой случайной траекторией
              startIdleStage('loop_flight');
            }
          }
        } else {
          // Автоматический режим ('auto'): по очереди 1 -> 2 -> 3
          if (p.idleStage === 'none') {
            p.nextIdleWaitSec -= dt;
            if (p.nextIdleWaitSec <= 0) {
              startIdleStage('horiz_spin');
            }
          } else {
            p.idleStageTime += dt;
            if (p.idleStage === 'horiz_spin' && p.idleStageTime >= 8.5) {
              // Переход ко 2-й анимации: толкает шарики по одному на разные прорисовываемые орбиты
              startIdleStage('multi_orbits');
            } else if (p.idleStage === 'multi_orbits' && p.idleStageTime >= 12.5) {
              // Переход к 3-й анимации: забирает все шарики внутрь себя, делает круг-облёт и выпускает обратно
              startIdleStage('loop_flight');
            } else if (p.idleStage === 'loop_flight' && p.idleStageTime >= 7.45) {
              // Завершение цикла сразу после вылета шариков на свои места: крестики плавно проявляются, перламутр затихает
              stopIdleShow();
              p.nextIdleWaitSec = getRandomIdleIntervalSec();
            }
          }
        }
      } else if (p.dockSide !== 'floating' && p.isOpen && !(p.isDragging && p.dragMoved) && p.splatTimer <= 0.05) {
        // Когда жемчужина и её бусины спокойно прикреплены к краю — случайно запускаются либо побег шарика с хлыстом, либо лёгкие волны с песчинками
        if (
          p.idleStage !== 'none' &&
          p.idleStage !== 'docked_musical_wave' &&
          p.idleStage !== 'docked_whip_catch'
        ) {
          stopIdleShow();
        }
        if (p.idleStage === 'none') {
          p.nextDockedWaveWaitSec -= dt;
          if (p.nextDockedWaveWaitSec <= 0) {
            // Чередуем с долей случайности, чтобы обе анимации у края регулярно и живо показывались
            const pickWhip =
              p.lastDockedStage === 'none'
                ? true
                : p.lastDockedStage === 'docked_musical_wave'
                  ? Math.random() < 0.78
                  : Math.random() < 0.42;
            startIdleStage(pickWhip ? 'docked_whip_catch' : 'docked_musical_wave');
          }
        } else if (p.idleStage === 'docked_musical_wave') {
          p.idleStageTime += dt;
          if (p.idleStageTime >= 7.6) {
            stopIdleShow();
            p.nextDockedWaveWaitSec = getRandomDockedWaveIntervalSec();
          }
        } else if (p.idleStage === 'docked_whip_catch') {
          p.idleStageTime += dt;
          if (p.idleStageTime >= 2.14) {
            stopIdleShow();
            p.nextDockedWaveWaitSec = getRandomDockedWaveIntervalSec();
          }
        }
      } else {
        if (p.idleStage !== 'none') {
          stopIdleShow();
        }
      }

      // 3. Расчёт целевой позиции главной кнопки и натяжения лизуна у стены
      let targetX = p.x;
      let targetY = p.y;
      let targetScaleX = 1;
      let targetScaleY = 1;
      let slimeStretchRatio = 0; // 0 = нет перемычки со стеной, >0 = тянется лизун
      let activeWallX = p.dockSide === 'left' ? 0 : w;

      // Если у стены идёт музыкальная волна или выброс хлыста — сама жемчужина живо реагирует объёмом
      const isMusicalWaveAtWall = p.dockSide !== 'floating' && p.idleStage === 'docked_musical_wave';
      const isWhipCatchAtWall = p.dockSide !== 'floating' && p.idleStage === 'docked_whip_catch';
      const musicalWaveEnv = isMusicalWaveAtWall
        ? Math.min(1, p.idleStageTime / 0.65) *
          (p.idleStageTime > 6.7 ? Math.max(0, 1 - (p.idleStageTime - 6.7) / 0.9) : 1)
        : 0;
      const pearlMusicalBeat = isMusicalWaveAtWall
        ? (Math.sin(p.idleStageTime * 5.4 * p.waveTempo) * 0.085 +
            Math.sin(p.idleStageTime * 10.8 * p.waveTempo) * 0.035) *
          musicalWaveEnv
        : 0;

      // Импульсы главной жемчужины при выбросе хлыста вдогонку и резком рывке шарика назад
      if (isWhipCatchAtWall) {
        const wt = p.idleStageTime;
        const dirSign = p.dockSide === 'right' ? -1 : 1;
        if (wt >= 0.16 && !p.whipLungeTriggered) {
          p.whipLungeTriggered = true;
          p.velScaleX = 2.7;
          p.velScaleY = -2.3;
          p.velSloshX = dirSign * 4.0;
        }
        if (wt >= 1.04 && !p.whipYankTriggered) {
          p.whipYankTriggered = true;
          // Резкое сокращение жемчужины, когда она дёргает натянутый хлыст на себя
          p.velScaleX = -3.5;
          p.velScaleY = 3.1;
          p.velSloshX = -dirSign * 4.8;
        }
        if (wt >= 1.38 && !p.whipReturnTriggered) {
          p.whipReturnTriggered = true;
          p.velScaleX = -2.5;
          p.velScaleY = 2.3;
        }
      }

      if (p.dockSide === 'right') {
        activeWallX = w;
        // Двигаем по вертикали вдоль стены только при реальном перетаскивании (dragMoved)
        targetY = p.isDragging && p.dragMoved ? Math.max(75, Math.min(h - 75, p.mouseY)) : p.y;
        const pullDist = p.isDragging && p.dragMoved ? p.pullDist : 0;

        if (pullDist > 0 && pullDist < PEEL_THRESHOLD_PX) {
          // Фаза натяжения лизуна перед отлипанием от правого края (шар реально отходит от стены до ~90px на вязкой шейке)
          slimeStretchRatio = pullDist / PEEL_THRESHOLD_PX;
          targetX = w - pullDist * 0.76;
          targetScaleX = 1 + slimeStretchRatio * 0.38;
          targetScaleY = 1 - slimeStretchRatio * 0.24;
        } else {
          targetX = w;
          targetScaleX = 1 + pearlMusicalBeat;
          targetScaleY = 1 - pearlMusicalBeat * 0.72;
        }
      } else if (p.dockSide === 'left') {
        activeWallX = 0;
        targetY = p.isDragging && p.dragMoved ? Math.max(75, Math.min(h - 75, p.mouseY)) : p.y;
        const pullDist = p.isDragging && p.dragMoved ? p.pullDist : 0;

        if (pullDist > 0 && pullDist < PEEL_THRESHOLD_PX) {
          // Фаза натяжения лизуна перед отлипанием от левого края
          slimeStretchRatio = pullDist / PEEL_THRESHOLD_PX;
          targetX = pullDist * 0.76;
          targetScaleX = 1 + slimeStretchRatio * 0.38;
          targetScaleY = 1 - slimeStretchRatio * 0.24;
        } else {
          targetX = 0;
          targetScaleX = 1 + pearlMusicalBeat;
          targetScaleY = 1 - pearlMusicalBeat * 0.72;
        }
      } else {
        // Свободный полёт (отлипла от края — круглая кнопка)
        if (p.idleStage === 'loop_flight') {
          const t = p.idleStageTime;
          if (t >= 1.8 && t <= 6.6) {
            // Фаза облёта со случайным наклоном, радиусом и формой виража (возврат строго в исходную точку loopOriginX, loopOriginY)
            const u = (t - 1.8) / 4.8; // 0..1
            const easedU = 0.5 - 0.5 * Math.cos(Math.PI * u);
            const theta = easedU * Math.PI * 2 * p.loopFlightDir;
            const localX = p.loopFlightRadiusX * Math.sin(theta);
            const localY =
              p.loopFlightLobe === 2
                ? p.loopFlightRadiusY * Math.sin(theta * 2) * 0.65
                : p.loopFlightRadiusY * (1 - Math.cos(theta)) * 0.72;
            const cosT = Math.cos(p.loopFlightTilt);
            const sinT = Math.sin(p.loopFlightTilt);
            const dirX = p.loopOriginX > w * 0.5 ? -1 : 1;
            const dirY = p.loopOriginY > h * 0.5 ? -1 : 1;
            p.mouseX = p.loopOriginX + dirX * (localX * cosT - localY * sinT);
            p.mouseY = p.loopOriginY + dirY * (localX * sinT + localY * cosT);
          } else {
            p.mouseX = p.loopOriginX;
            p.mouseY = p.loopOriginY;
          }
          // Когда лизун засосал в себя все 4 шарика — он становится чуть крупнее и полнее
          const absorbedCount = p.gulpedFlags.filter(Boolean).length;
          const absorbedBoost = t < 6.6 ? absorbedCount * 0.038 : 0;
          targetScaleX = 0.80 + absorbedBoost;
          targetScaleY = 0.80 + absorbedBoost;
        } else {
          targetScaleX = 0.80;
          targetScaleY = 0.80;
        }
        targetX = Math.max(36, Math.min(w - 36, p.mouseX));
        targetY = Math.max(75, Math.min(h - 75, p.mouseY));
      }

      // Если недавно прилипла к стене — затухающий таймер эффекта лизуна
      if (p.splatTimer > 0) {
        p.splatTimer = Math.max(0, p.splatTimer - dt * 2.5);
        slimeStretchRatio = Math.max(slimeStretchRatio, p.splatTimer * 0.85);
        activeWallX = p.splatWallX;
      }

      // Плавное движение центра кнопки и вычисление мгновенной скорости и ускорения для жидкой деформации
      const prevX = p.x;
      const prevY = p.y;
      const posLerp = p.isDragging ? 0.36 : 0.26;
      p.x += (targetX - p.x) * posLerp;
      p.y += (targetY - p.y) * posLerp;

      const vx = dt > 0.001 ? (p.x - prevX) / dt : 0;
      const vy = dt > 0.001 ? (p.y - prevY) / dt : 0;
      const axMain = dt > 0.001 ? (vx - p.prevVx) / dt : 0;
      const ayMain = dt > 0.001 ? (vy - p.prevVy) / dt : 0;
      p.prevVx = vx;
      p.prevVy = vy;

      // Пока жемчужину перетаскивают или она летит по инерции (шарики кружатся/тянутся следом) — скрываем книгу и крестики, а при остановке проявляем
      const nowMovingFast =
        (p.isDragging && p.dragMoved) ||
        Math.hypot(vx, vy) > 28 ||
        Math.hypot(p.freeVx, p.freeVy) > 25 ||
        p.splatTimer > 0.1;
      if (nowMovingFast !== p.wasMovingFast) {
        p.wasMovingFast = nowMovingFast;
        setIsMovingFast(nowMovingFast);
        if (!nowMovingFast && p.idleStage === 'none') {
          setCrossRevealCycle((prev) => prev + 1);
        }
      }

      // Позиционируем слои SVG-орбит в центре главной капли
      if (orbitOverlayRef.current) {
        orbitOverlayRef.current.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      }
      if (orbitThroughOverlayRef.current) {
        orbitThroughOverlayRef.current.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      }

      // Живое желеобразное колыхание жидкости (работает при любом движении/тряске и при отрыве от стены)
      const isFloatingOrPulling = p.dockSide === 'floating' || slimeStretchRatio > 0.02 || (p.isDragging && p.dragMoved);
      if (isFloatingOrPulling || Math.hypot(p.sloshX, p.sloshY) > 0.005 || Math.hypot(p.velSloshX, p.velSloshY) > 0.02) {
        // Настоящий слабозатухающий осциллятор желе (частота ~2.2 Гц, даёт 3-4 упругих колыхания после рывка)
        const sloshStiffness = 165;
        const sloshDamping = 5.2;
        const driveX = p.dockSide === 'floating' ? vx * 0.024 + axMain * 0.0005 : vx * 0.015;
        const driveY = vy * 0.024 + ayMain * 0.0005;

        p.velSloshX += (-p.sloshX * sloshStiffness - p.velSloshX * sloshDamping + driveX) * dt;
        p.velSloshY += (-p.sloshY * sloshStiffness - p.velSloshY * sloshDamping + driveY) * dt;
        p.sloshX = Math.max(-0.65, Math.min(0.65, p.sloshX + p.velSloshX * dt));
        p.sloshY = Math.max(-0.65, Math.min(0.65, p.sloshY + p.velSloshY * dt));
      } else {
        p.sloshX = 0;
        p.sloshY = 0;
        p.velSloshX = 0;
        p.velSloshY = 0;
      }

      // Когда тянем, толкаем или дергаем из стороны в сторону — капля заметно растягивается вдоль движения и сжимается поперёк
      const liquidStretch = (p.sloshX - p.sloshY) * 0.34 + (Math.abs(p.sloshX) - Math.abs(p.sloshY)) * 0.25;
      const clampedStretch = Math.max(-0.34, Math.min(0.34, liquidStretch));
      const finalTargetScaleX = targetScaleX * (1 + clampedStretch);
      const finalTargetScaleY = targetScaleY * (1 - clampedStretch);

      // Упругая пружина масштаба (с низким демпфированием для желейного «бульканья» лизуна)
      const stiffness = 240;
      const damping = 10.5;
      const forceX = (finalTargetScaleX - p.scaleX) * stiffness;
      const forceY = (finalTargetScaleY - p.scaleY) * stiffness;
      p.velScaleX = (p.velScaleX + forceX * dt) * Math.max(0, 1 - damping * dt);
      p.velScaleY = (p.velScaleY + forceY * dt) * Math.max(0, 1 - damping * dt);
      p.scaleX += p.velScaleX * dt;
      p.scaleY += p.velScaleY * dt;

      // Живая асимметричная форма капли (border-radius «дышит» при тряске и вытягивается каплей при отрыве от стены)
      let skewX = Math.round(p.sloshX * 44);
      const skewY = Math.round(p.sloshY * 44);
      if (slimeStretchRatio > 0.03) {
        const pullSkew = Math.round(slimeStretchRatio * 20);
        skewX += p.dockSide === 'right' ? pullSkew : -pullSkew;
      }
      const r1 = Math.max(28, Math.min(72, 50 - skewX + skewY));
      const r2 = Math.max(28, Math.min(72, 50 + skewX + skewY));
      const r3 = Math.max(28, Math.min(72, 50 + skewX - skewY));
      const r4 = Math.max(28, Math.min(72, 50 - skewX - skewY));
      const dynamicRadius =
        Math.abs(skewX) >= 1 || Math.abs(skewY) >= 1
          ? `${r1}% ${r2}% ${r3}% ${r4}% / ${r4}% ${r1}% ${r2}% ${r3}%`
          : '50%';

      // Применяем трансформацию и живую форму капли к главной кнопке
      if (mainBtnRef.current) {
        mainBtnRef.current.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) scale(${p.scaleX.toFixed(3)}, ${p.scaleY.toFixed(3)})`;
        mainBtnRef.current.style.borderRadius = dynamicRadius;
      }

      // 4. Отрисовка вязкой перемычки лизуна со стеной при отлипании / прилипании
      if (slimeStretchRatio > 0.02) {
        const padScaleY = Math.max(0.25, 1.25 - slimeStretchRatio * 0.45);
        const padScaleX = Math.max(0.25, 1.05 - slimeStretchRatio * 0.25);
        const n1X = activeWallX + (p.x - activeWallX) * 0.32;
        const n2X = activeWallX + (p.x - activeWallX) * 0.64;
        // Шейка лизуна тянется между стеной и шаром и утончается перед самым отрывом
        const neckThickness = Math.max(0.22, (1 - slimeStretchRatio * 0.68) * 1.15);

        if (wallPadRef.current) {
          wallPadRef.current.style.transform = `translate3d(${activeWallX.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) scale(${padScaleX.toFixed(3)}, ${padScaleY.toFixed(3)})`;
        }
        if (neck1Ref.current) {
          neck1Ref.current.style.transform = `translate3d(${n1X.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) scale(${(neckThickness * 1.12).toFixed(3)}, ${(neckThickness * 0.95).toFixed(3)})`;
        }
        if (neck2Ref.current) {
          neck2Ref.current.style.transform = `translate3d(${n2X.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) scale(${(neckThickness * 0.98).toFixed(3)}, ${(neckThickness * 0.85).toFixed(3)})`;
        }
      } else {
        if (wallPadRef.current) {
          wallPadRef.current.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) scale(0)`;
        }
        if (neck1Ref.current) {
          neck1Ref.current.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) scale(0)`;
        }
        if (neck2Ref.current) {
          neck2Ref.current.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) scale(0)`;
        }
      }

      // 5. Физика 4 жемчужных шариков (+) на «невидимых лесках» + 3 автономные анимации
      if (p.dockSide === 'floating' && p.idleStage === 'loop_flight') {
        if (p.idleStageTime >= 6.6 && !p.loopReleaseTriggered) {
          p.loopReleaseTriggered = true;
          p.velScaleX = -3.6;
          p.velScaleY = 3.4;
        }
      }

      const mainSpeed = Math.hypot(vx, vy);
      // При движении главного шара точка притяжения слегка смещается в шлейф позади движения
      const trailFactor = Math.min(1, mainSpeed / 650);
      const wakeOffsetX = -vx * 0.045 * trailFactor;
      const wakeOffsetY = -vy * 0.045 * trailFactor;
      let anyDropletInTransit = false;

      for (let i = 0; i < 4; i++) {
        const d = p.droplets[i];
        // В 3-й анимации (loop_flight) лизун засасывает шарики по очереди (каждые 0.22 сек) внутрь себя (до t = 6.6 сек)
        const isThisDropletSuckedIn =
          p.dockSide === 'floating' &&
          p.idleStage === 'loop_flight' &&
          p.idleStageTime >= i * 0.22 &&
          p.idleStageTime < 6.6;

        const showThisDroplet = p.dockSide === 'floating' ? !isThisDropletSuckedIn : p.isOpen;

        if (isThisDropletSuckedIn && !p.gulpedFlags[i] && Math.hypot(d.wx - p.x, d.wy - p.y) < 28) {
          // Упругий «глоток» лизуна, когда очередной шарик втянулся внутрь
          p.gulpedFlags[i] = true;
          p.velScaleX = 2.1;
          p.velScaleY = 1.9;
        }

        let targetDx = 0;
        let targetDy = 0;
        let targetScale = 0;
        let zDepthOrder = 10;

        if (showThisDroplet) {
          targetScale = 1;
          if (p.dockSide === 'floating') {
            if (p.idleStage === 'horiz_spin') {
              // АНИМАЦИЯ 1 (Скрин 2): Асинхронное и случайное 3D-вращение капель со сменой наклона орбит, радиуса и скорости в реальном времени
              const so = p.spinOrbits[i];
              so.changeTimer -= dt;
              if (so.changeTimer <= 0) {
                // Каждая капля в свой случайный момент времени плавно меняет 3D-плоскость наклона, радиус и угловую скорость
                const dirSign = Math.random() < 0.16 ? -Math.sign(so.targetSpeed || 1) : Math.sign(so.targetSpeed || 1);
                so.targetSpeed = dirSign * (1.65 + Math.random() * 2.85);
                so.targetTilt = (Math.random() - 0.5) * 1.72; // наклон траектории от -50° до +50°
                so.targetRadiusX = 56 + Math.random() * 42;
                so.targetRadiusY = 11 + Math.random() * 19;
                so.targetOffsetY = (Math.random() - 0.5) * 30;
                so.changeTimer = 1.15 + Math.random() * 2.35;
              }
              const morph = Math.min(1, dt * 1.55);
              so.speed += (so.targetSpeed - so.speed) * morph;
              so.tilt += (so.targetTilt - so.tilt) * morph;
              so.radiusX += (so.targetRadiusX - so.radiusX) * morph;
              so.radiusY += (so.targetRadiusY - so.radiusY) * morph;
              so.offsetY += (so.targetOffsetY - so.offsetY) * morph;
              so.angle = (so.angle + dt * so.speed) % (Math.PI * 2);

              const theta = so.angle;
              p.customAngles[i] = theta;
              const depthZ = Math.sin(theta); // +1 = перед главным шаром, -1 = позади главного шара
              const lx = Math.cos(theta) * so.radiusX;
              const ly = depthZ * so.radiusY;
              const cosT = Math.cos(so.tilt);
              const sinT = Math.sin(so.tilt);

              targetDx = lx * cosT - ly * sinT;
              targetDy = lx * sinT + ly * cosT + so.offsetY;
              targetScale = 0.95 + depthZ * 0.23;
              zDepthOrder = depthZ > 0 ? 25 : 10;
            } else if (p.idleStage === 'multi_orbits') {
              // АНИМАЦИЯ 2 (Скрин 1): Капли идут строго по прорисованным орбитальным линиям и пропускают линии сквозь себя (с асинхронной случайной скоростью)
              const t = p.idleStageTime;
              const pushTime = MULTI_ORBIT_PUSH_TIMES[i];
              const orbitR = MULTI_ORBIT_RADII[i];
              const cEl = orbitCircleRefs.current[i];
              const innerArcEl = orbitInnerArcRefs.current[i];
              const innerCoreEl = orbitInnerCoreRefs.current[i];
              const entryDotEl = orbitEntryDotRefs.current[i];
              const exitDotEl = orbitExitDotRefs.current[i];

              if (t < pushTime) {
                // До толчка шарик ждёт у края главной капли
                const waitAngle = (i * Math.PI) / 2 + t * 0.5;
                targetDx = Math.cos(waitAngle) * 44;
                targetDy = Math.sin(waitAngle) * 44;
                targetScale = 0.92;
                if (cEl) cEl.style.opacity = '0';
                if (innerArcEl) innerArcEl.style.opacity = '0';
                if (innerCoreEl) innerCoreEl.style.opacity = '0';
                if (entryDotEl) entryDotEl.style.opacity = '0';
                if (exitDotEl) exitDotEl.style.opacity = '0';
              } else {
                // В момент толчка главная капля делает упругий толчок в сторону этого шарика
                if (!p.pushedFlags[i]) {
                  p.pushedFlags[i] = true;
                  const pushAngle = (i * Math.PI) / 2 + pushTime * 0.5;
                  p.customAngles[i] = pushAngle;
                  p.velScaleX = -2.4;
                  p.velScaleY = 2.2;
                  p.velSloshX = Math.cos(pushAngle) * 3.2;
                  p.velSloshY = Math.sin(pushAngle) * 3.2;
                }

                // Асинхронная случайная вариация скорости каждой капли на своём кольце
                const dyn = p.multiOrbitDyn[i];
                dyn.changeTimer -= dt;
                if (dyn.changeTimer <= 0) {
                  const baseSpd = MULTI_ORBIT_SPEEDS[i];
                  const dirSign = Math.random() < 0.15 ? -Math.sign(dyn.targetSpeed || 1) : Math.sign(dyn.targetSpeed || 1);
                  dyn.targetSpeed = dirSign * baseSpd * (0.65 + Math.random() * 0.85);
                  dyn.changeTimer = 1.5 + Math.random() * 2.4;
                }
                dyn.speed += (dyn.targetSpeed - dyn.speed) * Math.min(1, dt * 1.8);

                // Прорисовка кольца орбиты (в режиме зацикливания loop_multi_orbits кольца не затухают)
                const sincePush = t - pushTime;
                const drawProgress = Math.min(1, sincePush / 0.75);
                const isLoopedOrbits = p.animationMode === 'loop_multi_orbits';
                const fadeOut = !isLoopedOrbits && t > 11.2 ? Math.max(0, 1 - (t - 11.2) / 1.3) : 1;

                if (cEl) {
                  const circum = 2 * Math.PI * orbitR;
                  cEl.style.strokeDashoffset = `${(circum * (1 - drawProgress)).toFixed(1)}`;
                  cEl.style.opacity = `${(drawProgress * fadeOut * 0.88).toFixed(3)}`;
                }

                p.customAngles[i] = (p.customAngles[i] + dt * dyn.speed) % (Math.PI * 2);
                const theta = p.customAngles[i];
                targetDx = Math.cos(theta) * orbitR;
                targetDy = Math.sin(theta) * orbitR;
                targetScale = 1;

                // Отрисовка участка линии, проходящего СКВОЗЬ саму каплю (преломленная нить внутри полупрозрачной жемчужины + блики входа/выхода)
                const lockOnRing = Math.min(1, sincePush / 0.22);
                const innerOpacity = drawProgress * fadeOut * lockOnRing;
                const dropletRadius = 17.5;
                const halfAngle = Math.asin(Math.min(0.95, dropletRadius / orbitR));
                const aStart = theta - halfAngle;
                const aEnd = theta + halfAngle;
                const x1 = Math.cos(aStart) * orbitR;
                const y1 = Math.sin(aStart) * orbitR;
                const x2 = Math.cos(aEnd) * orbitR;
                const y2 = Math.sin(aEnd) * orbitR;
                const arcPathD = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${orbitR} ${orbitR} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;

                if (innerArcEl) {
                  innerArcEl.setAttribute('d', arcPathD);
                  innerArcEl.style.opacity = `${(innerOpacity * 0.92).toFixed(3)}`;
                }
                if (innerCoreEl) {
                  innerCoreEl.setAttribute('d', arcPathD);
                  innerCoreEl.style.opacity = `${(innerOpacity * 0.96).toFixed(3)}`;
                }
                if (entryDotEl) {
                  entryDotEl.setAttribute('cx', x1.toFixed(2));
                  entryDotEl.setAttribute('cy', y1.toFixed(2));
                  entryDotEl.style.opacity = `${(innerOpacity * 0.95).toFixed(3)}`;
                }
                if (exitDotEl) {
                  exitDotEl.setAttribute('cx', x2.toFixed(2));
                  exitDotEl.setAttribute('cy', y2.toFixed(2));
                  exitDotEl.style.opacity = `${(innerOpacity * 0.95).toFixed(3)}`;
                }
              }
            } else {
              // Обычная очень медленная круговая орбита 360° (R = 72px) + смещение в шлейф при быстром движении
              const angle = p.orbitAngle + (i * Math.PI) / 2;
              const spread = 1 - trailFactor * 0.35;
              targetDx = Math.cos(angle) * ORBIT_RADIUS_FLOATING * spread + wakeOffsetX * (1 + i * 0.14);
              targetDy = Math.sin(angle) * ORBIT_RADIUS_FLOATING * spread + wakeOffsetY * (1 + i * 0.14);
            }
          } else {
            // Полукруг вокруг полукруглой кнопки у края
            const dirX = p.dockSide === 'right' ? -1 : 1;
            const rad = (ARC_ANGLES_DEG[i] * Math.PI) / 180;

            if (p.idleStage === 'docked_musical_wave') {
              // Во время анимации лёгких волн у края:
              // 1) На старте (0..0.95с) первая лёгкая волна от главной жемчужины проходит сквозь шарики, и они мягко рассыпаются в песчинки
              // 2) В середине (0.95..5.75с) от главной жемчужины расходятся лёгкие воздушные волны (шарики скрыты, scale = 0)
              // 3) В финале (5.75..7.35с) прямо из воздуха вокруг 4 точек проявляются лёгкие песчинки и собирают шарики обратно!
              const t = p.idleStageTime;
              // Лёгкий снос наружу при прохождении первой волны (0..0.95с)
              const outwardDrift = t < 1.0 ? Math.min(1, Math.max(0, (t - 0.15) / 0.75)) * 8 : 0;
              const currentR = ARC_RADIUS_DOCKED + outwardDrift;

              targetDx = dirX * Math.cos(rad) * currentR;
              targetDy = Math.sin(rad) * currentR;

              if (t < 0.95) {
                // Мягкое таяние шариков в песчинки, когда их касается первая волна от жемчужины
                const dissolveProgress = Math.min(1, Math.max(0, (t - 0.18) / 0.72));
                targetScale = Math.pow(1 - dissolveProgress, 1.6);
              } else if (t < 5.75) {
                // Пока от главной жемчужины идут лёгкие волны — шарики растворены в воздухе
                targetScale = 0;
              } else {
                // Из воздуха слетаются лёгкие песчинки и постепенно собирают шарики (5.75..7.25с)
                const gatherProgress = Math.min(1, (t - 5.75) / 1.35);
                const smoothGrow =
                  gatherProgress * gatherProgress * (3 - 2 * gatherProgress) +
                  Math.sin(gatherProgress * Math.PI) * 0.08;
                targetScale = Math.min(1.06, smoothGrow);
              }
            } else if (p.idleStage === 'docked_whip_catch') {
              // АНИМАЦИЯ ПОБЕГА ШАРИКА ДАЛЕКО И НЕ ПО ПРЯМОЙ + ЗАХВАТ ХЛЫСТОМ ПО РАЗНЫМ ТРАЕКТОРИЯМ
              const t = p.idleStageTime;
              if (i === p.whipTargetIdx) {
                const homeDx = dirX * Math.cos(rad) * ARC_RADIUS_DOCKED;
                const homeDy = Math.sin(rad) * ARC_RADIUS_DOCKED;

                if (t < 0.54) {
                  // 1. Стремительный нелинейный рывок шарика далеко прочь от жемчужины по выбранной кривой траектории (0..0.54с)
                  const u = Math.min(1, t / 0.54);
                  const fastBolt = 1 - Math.pow(1 - u, 2.25);
                  const pt = evalWhipEscapePoint(fastBolt);
                  targetDx = pt.dx;
                  targetDy = pt.dy;
                  targetScale = 1.06;
                } else if (t < 1.04) {
                  // 2. Хлыст настигает шарик на дальней виражной траектории (t = 0.54с), гасит его инерцию и туго обвивает (0.54..1.04с)
                  const endPt = evalWhipEscapePoint(1);
                  const prevPt = evalWhipEscapePoint(0.92);
                  const tangX = endPt.dx - prevPt.dx;
                  const tangY = endPt.dy - prevPt.dy;
                  const tangLen = Math.hypot(tangX, tangY) || 1;
                  const tx = tangX / tangLen;
                  const ty = tangY / tangLen;

                  const caughtPhase = (t - 0.54) / 0.50; // 0..1
                  // Шарик по инерции натягивает хлыст вдоль касательной траектории и трепыхается в кольцах хлыста
                  const inertiaStretch = Math.sin(caughtPhase * Math.PI) * 14 - caughtPhase * 12;
                  const struggleAmp = (1 - caughtPhase * 0.75) * 2.8;
                  const struggleJitterX = Math.sin(t * 62) * struggleAmp;
                  const struggleJitterY = Math.cos(t * 56) * struggleAmp;

                  targetDx = endPt.dx + tx * inertiaStretch + struggleJitterX;
                  targetDy = endPt.dy + ty * inertiaStretch + struggleJitterY;
                  // В объятиях тугих колец хлыста шарик слегка упруго сжимается
                  targetScale = 0.91;
                } else if (t < 1.38) {
                  // 3. Резкий возврат назад хлыстом из дальней точки поимки прямо на место в полукруге!
                  const uYank = Math.min(1, (t - 1.04) / 0.34);
                  const yankCurve =
                    uYank < 0.5 ? 4 * Math.pow(uYank, 3) : 1 - Math.pow(-2 * uYank + 2, 3) / 2;

                  const endPt = evalWhipEscapePoint(1);
                  const prevPt = evalWhipEscapePoint(0.92);
                  const tangX = endPt.dx - prevPt.dx;
                  const tangY = endPt.dy - prevPt.dy;
                  const tangLen = Math.hypot(tangX, tangY) || 1;
                  const catchDx = endPt.dx - (tangX / tangLen) * 12;
                  const catchDy = endPt.dy - (tangY / tangLen) * 12;

                  // Лёгкая хлесткая дуга при резком возврате назад
                  const retChordX = homeDx - catchDx;
                  const retChordY = homeDy - catchDy;
                  const retLen = Math.hypot(retChordX, retChordY) || 1;
                  const rnx = (-retChordY / retLen) * p.whipCurveSign;
                  const rny = (retChordX / retLen) * p.whipCurveSign;
                  const snapArc = Math.sin(yankCurve * Math.PI) * 16;

                  targetDx = catchDx + retChordX * yankCurve + rnx * snapArc;
                  targetDy = catchDy + retChordY * yankCurve + rny * snapArc;
                  targetScale = 0.91 + 0.17 * yankCurve;
                } else {
                  // 4. Шарик вернулся на своё место и упруго пружинит после резкого возврата
                  const settleT = Math.min(1, (t - 1.38) / 0.52);
                  const bounceR =
                    ARC_RADIUS_DOCKED - Math.sin(settleT * Math.PI * 2.2) * 8 * (1 - settleT);
                  targetDx = dirX * Math.cos(rad) * bounceR;
                  targetDy = Math.sin(rad) * bounceR;
                  targetScale = 1 + Math.sin(settleT * Math.PI * 2.2) * 0.13 * (1 - settleT);
                }
              } else {
                // Остальные 3 шарика спокойно стоят на своих местах полукруга
                targetDx = dirX * Math.cos(rad) * ARC_RADIUS_DOCKED;
                targetDy = Math.sin(rad) * ARC_RADIUS_DOCKED + wakeOffsetY * (0.8 + i * 0.12);
              }
            } else {
              targetDx = dirX * Math.cos(rad) * ARC_RADIUS_DOCKED;
              targetDy = Math.sin(rad) * ARC_RADIUS_DOCKED + wakeOffsetY * (0.8 + i * 0.12);
            }
          }
        }

        // Если шарик полностью втянут внутрь главного шара — держим его точно в центре (p.x, p.y)
        if (!showThisDroplet && d.scale < 0.05 && Math.hypot(d.wx - p.x, d.wy - p.y) < 12) {
          d.wx = p.x;
          d.wy = p.y;
          d.vx = 0;
          d.vy = 0;
          d.scale = 0;
        } else {
          const anchorX = p.x + targetDx;
          const anchorY = p.y + targetDy;

          // В режиме multi_orbits после выталкивания капля жёстко фиксируется прямо по центру линии орбиты (без радиального отставания пружины!)
          const isLockedOnMultiOrbitRing =
            showThisDroplet &&
            p.dockSide === 'floating' &&
            p.idleStage === 'multi_orbits' &&
            p.idleStageTime >= MULTI_ORBIT_PUSH_TIMES[i];

          if (isLockedOnMultiOrbitRing) {
            const sincePush = p.idleStageTime - MULTI_ORBIT_PUSH_TIMES[i];
            const lockBlend = Math.min(1, sincePush / 0.20);
            d.wx += (anchorX - d.wx) * (0.32 + 0.68 * lockBlend);
            d.wy += (anchorY - d.wy) * (0.32 + 0.68 * lockBlend);
            d.vx = 0;
            d.vy = 0;
            d.scale += (targetScale - d.scale) * 0.25;
          } else {
            // При побеге шарика и рывке хлыстом даём высокую жёсткость, чтобы нелинейный вираж и возврат были максимально быстрыми и точными
            const isRunawayWhipBead = p.dockSide !== 'floating' && p.idleStage === 'docked_whip_catch' && i === p.whipTargetIdx;
            const isInOrbitShow =
              (p.dockSide === 'floating' && (p.idleStage === 'horiz_spin' || p.idleStage === 'multi_orbits')) ||
              (p.dockSide !== 'floating' && p.idleStage === 'docked_musical_wave');
            const lineStiffness = !showThisDroplet
              ? 210
              : isRunawayWhipBead
                ? 680
                : isInOrbitShow
                  ? 260
                  : 115 - i * 12;
            const lineDamping = !showThisDroplet
              ? 14
              : isRunawayWhipBead
                ? 28
                : isInOrbitShow
                  ? 16
                  : 8.2 - i * 0.45;

            const ax = (anchorX - d.wx) * lineStiffness;
            const ay = (anchorY - d.wy) * lineStiffness;

            const dampFactor = Math.max(0, 1 - lineDamping * dt);
            d.vx = (d.vx + ax * dt) * dampFactor;
            d.vy = (d.vy + ay * dt) * dampFactor;

            d.wx += d.vx * dt;
            d.wy += d.vy * dt;

            // Ограничение максимальной длины «невидимой лески» от центра главного шара
            const relX = d.wx - p.x;
            const relY = d.wy - p.y;
            const dist = Math.hypot(relX, relY);
            const maxLineLen = isRunawayWhipBead
              ? 520
              : p.idleStage === 'multi_orbits'
                ? 148
                : p.idleStage === 'docked_musical_wave'
                  ? 132
                  : (p.dockSide === 'floating' ? 116 : 98) + i * 10;

            if (dist > maxLineLen && dist > 0.001) {
              const nx = relX / dist;
              const ny = relY / dist;
              d.wx = p.x + nx * maxLineLen;
              d.wy = p.y + ny * maxLineLen;
              const radialVel = (d.vx - vx) * nx + (d.vy - vy) * ny;
              if (radialVel > 0) {
                d.vx -= nx * radialVel * 0.85;
                d.vy -= ny * radialVel * 0.85;
              }
            }

            // В обычном свободном полёте шарики огибают главную сферу по дуге лески (НЕ блокируем втягивание при !showThisDroplet)
            const minOrbitClearance = 48;
            if (
              showThisDroplet &&
              p.dockSide === 'floating' &&
              p.idleStage === 'none' &&
              d.scale > 0.75 &&
              dist < minOrbitClearance &&
              dist > 0.001
            ) {
              const nx = relX / dist;
              const ny = relY / dist;
              d.wx = p.x + nx * minOrbitClearance;
              d.wy = p.y + ny * minOrbitClearance;
            }

            // У стены не даём шарикам уходить за край экрана
            if (p.dockSide === 'right' && d.wx > w - 18) {
              d.wx = w - 18;
            } else if (p.dockSide === 'left' && d.wx < 18) {
              d.wx = 18;
            }

            // Когда шарик подлетает к центру при засасывании — плавно уменьшаем его масштаб в 0 внутри лизуна
            const effectiveTargetScale = !showThisDroplet ? (dist < 36 ? 0 : 0.65) : targetScale;
            const scaleLerp =
              p.idleStage === 'docked_musical_wave' || isRunawayWhipBead ? 0.28 : !showThisDroplet ? 0.22 : 0.16;
            d.scale += (effectiveTargetScale - d.scale) * scaleLerp;
          }
        }

        const absX = d.wx;
        const absY = d.wy;
        const dxFromMain = absX - p.x;
        const dyFromMain = absY - p.y;
        const distFromCenter = Math.hypot(dxFromMain, dyFromMain);

        const btnEl = dropletBtnRefs.current[i];
        const gooEl = dropletGooRefs.current[i];
        const bridgeEl = bridgeGooRefs.current[i];

        if (btnEl) {
          const isAnimatingOrSpinning = p.idleStage !== 'none' || p.wasMovingFast;
          btnEl.style.transform = `translate3d(${absX.toFixed(1)}px, ${absY.toFixed(1)}px, 0) scale(${d.scale.toFixed(3)})`;
          btnEl.style.opacity = d.scale > 0.06 ? String(Math.min(1, (d.scale - 0.06) * 1.35)) : '0';
          // Нажать на книгу (и остальные сферы) можно только когда анимации нет и сферы остановились
          btnEl.style.pointerEvents =
            !isAnimatingOrSpinning && showThisDroplet && d.scale > 0.65 ? 'auto' : 'none';
          btnEl.style.zIndex = String(zDepthOrder);
        }

        // Метаболл-перемычка работает при вылезании/прятании капель у стены И при засасывании/выпуске шариков в 3-й анимации (loop_flight)
        const allowGooMerge =
          (p.dockSide !== 'floating' &&
            p.idleStage !== 'docked_musical_wave' &&
            p.idleStage !== 'docked_whip_catch') ||
          p.idleStage === 'loop_flight';
        const isInLiquidTransit = allowGooMerge && distFromCenter > 10 && distFromCenter < 62;
        if (isInLiquidTransit) {
          anyDropletInTransit = true;
        }

        if (gooEl) {
          const gooDropScale = isInLiquidTransit ? Math.max(0.45, d.scale) * 0.96 : 0;
          gooEl.style.transform = `translate3d(${absX.toFixed(1)}px, ${absY.toFixed(1)}px, 0) scale(${gooDropScale.toFixed(3)})`;
        }

        if (bridgeEl) {
          if (isInLiquidTransit) {
            const bridgeProgress = (distFromCenter - 10) / 52; // 0..1
            const bridgeScale = Math.sin(bridgeProgress * Math.PI) * 1.05;
            const bx = p.x + dxFromMain * 0.54;
            const by = p.y + dyFromMain * 0.54;
            bridgeEl.style.transform = `translate3d(${bx.toFixed(1)}px, ${by.toFixed(1)}px, 0) scale(${bridgeScale.toFixed(3)})`;
          } else {
            bridgeEl.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) scale(0)`;
          }
        }
      }

      // Отрисовка на Canvas: либо ЛЁГКИЕ ВОЗДУШНЫЕ ВОЛНЫ + ПЕСЧИНКИ, либо ПЕРЛАМУТРОВЫЙ ХЛЫСТ, ДОГОНЯЮЩИЙ И ОБВИВАЮЩИЙ СБЕЖАВШИЙ ШАРИК
      if ((isMusicalWaveAtWall || isWhipCatchAtWall) && waveCanvasRef.current) {
        const canvas = waveCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const cw = 960;
          const ch = 960;
          if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
            canvas.width = cw * dpr;
            canvas.height = ch * dpr;
          }
          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.clearRect(0, 0, cw, ch);
          ctx.translate(cw / 2, ch / 2);

          const t = p.idleStageTime;
          const dirX = p.dockSide === 'right' ? -1 : 1;

          // 1. ЛЁГКИЕ ВОЗДУШНЫЕ ВОЛНЫ, РАСХОДЯЩИЕСЯ ОТ ГЛАВНОЙ ЖЕМЧУЖИНЫ (0..6.2с, только в режиме музыкальной волны)
          const wavesGlobalEnv = isMusicalWaveAtWall
            ? Math.min(1, t / 0.45) * (t > 5.2 ? Math.max(0, 1 - (t - 5.2) / 1.05) : 1)
            : 0;

          if (wavesGlobalEnv > 0.01) {
            const maxSpanRad = (76 * Math.PI) / 180;
            const numWaves = 4;

            for (let wIdx = 0; wIdx < numWaves; wIdx++) {
              // Каждая волна плавно рождается у края главной жемчужины (r = 38px) и расходится в воздух до r = 142px
              const rawCycle = (t * 0.46 * p.waveTempo + wIdx / numWaves) % 1;
              const easedProg = 1 - Math.pow(1 - rawCycle, 1.35);
              const waveR = 38 + easedProg * 104;

              // Плавное появление у поверхности жемчужины и растворение в воздухе вдали
              const waveAlpha = Math.sin(Math.pow(rawCycle, 0.72) * Math.PI) * wavesGlobalEnv * 0.55;
              if (waveAlpha <= 0.01) continue;

              const trailWidth = 22 * (0.65 + 0.35 * Math.sin(rawCycle * Math.PI));
              const steps = 38;
              const crestPts: { x: number; y: number }[] = [];
              const innerPts: { x: number; y: number }[] = [];

              for (let s = 0; s <= steps; s++) {
                const u = (s / steps) * 2 - 1; // -1 .. +1
                const ang = u * maxSpanRad;
                // Едва заметное живое дыхание фронта волны (без «червяка» — чистая мягкая расходящаяся волна)
                const gentleRipple =
                  Math.sin(u * 3.5 + t * 2.6 * p.waveDirection + wIdx * 1.6) * 2.6 +
                  Math.cos(u * 2.0 - t * 2.0) * 1.6;
                const edgeFade = Math.sin(Math.acos(Math.max(-0.999, Math.min(0.999, u))));
                const rFront = waveR + gentleRipple * edgeFade;
                const rBack = Math.max(36, rFront - trailWidth * Math.pow(edgeFade, 0.7));

                const cosA = Math.cos(ang);
                const sinA = Math.sin(ang);
                crestPts.push({ x: dirX * cosA * rFront, y: sinA * rFront });
                innerPts.push({ x: dirX * cosA * rBack, y: sinA * rBack });
              }

              ctx.save();
              ctx.beginPath();
              ctx.moveTo(crestPts[0].x, crestPts[0].y);
              for (let s = 1; s < crestPts.length; s++) {
                const prev = crestPts[s - 1];
                const curr = crestPts[s];
                ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) * 0.5, (prev.y + curr.y) * 0.5);
              }
              ctx.lineTo(crestPts[crestPts.length - 1].x, crestPts[crestPts.length - 1].y);
              for (let s = innerPts.length - 1; s >= 0; s--) {
                const curr = innerPts[s];
                const next = s > 0 ? innerPts[s - 1] : innerPts[0];
                ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) * 0.5, (curr.y + next.y) * 0.5);
              }
              ctx.closePath();

              // Мягкий радиальный градиент расходящейся от жемчужины воздушной волны (прозрачный шлейф -> нежный перламутр -> белый гребень)
              const rGradInner = Math.max(34, waveR - trailWidth - 4);
              const rGradOuter = waveR + 6;
              const radGrad = ctx.createRadialGradient(0, 0, rGradInner, 0, 0, rGradOuter);
              radGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
              if (wIdx % 2 === 0) {
                radGrad.addColorStop(0.52, `rgba(212, 236, 255, ${(waveAlpha * 0.45).toFixed(3)})`);
                radGrad.addColorStop(0.76, `rgba(244, 220, 248, ${(waveAlpha * 0.58).toFixed(3)})`);
              } else {
                radGrad.addColorStop(0.52, `rgba(242, 222, 252, ${(waveAlpha * 0.45).toFixed(3)})`);
                radGrad.addColorStop(0.76, `rgba(208, 242, 248, ${(waveAlpha * 0.58).toFixed(3)})`);
              }
              radGrad.addColorStop(0.91, `rgba(255, 255, 255, ${(waveAlpha * 0.95).toFixed(3)})`);
              radGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

              ctx.fillStyle = radGrad;
              ctx.fill();
              ctx.restore();
            }
          }

          // 2. ЛЁГКИЕ ПЕРЛАМУТРОВЫЕ ПЕСЧИНКИ (только в режиме музыкальной волны):
          // - На старте (0.18..1.65с): когда первая волна касается 4 шариков, они рассыпаются в мелкие песчинки и уносятся волной в воздух
          // - В финале (5.25..7.25с): прямо из воздуха проявляются лёгкие песчинки и слетаются в 4 точки, собирая шарики обратно!
          const isDissolveBurst = isMusicalWaveAtWall && t >= 0.16 && t <= 1.75;
          const isAirCondense = isMusicalWaveAtWall && t >= 5.20 && t <= 7.35;

          if (isDissolveBurst || isAirCondense) {
            for (let m = 0; m < PEARL_SAND_GRAINS.length; m++) {
              const g = PEARL_SAND_GRAINS[m];
              const bAng = (ARC_ANGLES_DEG[g.targetBead] * Math.PI) / 180;
              const beadX = dirX * Math.cos(bAng) * ARC_RADIUS_DOCKED;
              const beadY = Math.sin(bAng) * ARC_RADIUS_DOCKED;

              let gx = beadX;
              let gy = beadY;
              let gAlpha = 0;
              let gRadius = g.radius;

              if (isDissolveBurst) {
                // Фаза рассыпания шариков от первой волны жемчужины
                const localT = Math.max(0, Math.min(1, (t - 0.18 - g.stagger * 0.65) / 1.18));
                if (localT <= 0 || localT >= 1) continue;

                const easeOut = 1 - Math.pow(1 - localT, 2.2);
                // Песчинки мягко сдуваются волной от жемчужины наружу и рассеиваются в воздухе
                const outwardPush = easeOut * (18 + g.spawnDist * 0.75);
                const scatterX = Math.cos(g.spawnAngle) * easeOut * (g.spawnDist * 0.55);
                const scatterY = Math.sin(g.spawnAngle) * easeOut * (g.spawnDist * 0.55);

                gx = beadX + dirX * Math.cos(bAng) * outwardPush + scatterX;
                gy = beadY + Math.sin(bAng) * outwardPush + scatterY;
                gAlpha = Math.sin(Math.pow(localT, 0.6) * Math.PI) * 0.88;
                gRadius = g.radius * (1 - localT * 0.35);
              } else if (isAirCondense) {
                // Фаза сборки шариков прямо из воздуха из лёгких песчинок
                const localT = Math.max(0, Math.min(1, (t - 5.25 - g.stagger) / 1.55));
                if (localT <= 0 || localT >= 1) continue;

                // Плавное ускорение песчинки из воздуха к центру шарика
                const condenseEase =
                  localT < 0.5
                    ? 2 * localT * localT
                    : 1 - Math.pow(-2 * localT + 2, 2) / 2;
                const distFromBead = (1 - condenseEase) * g.spawnDist;
                const angleInAir = g.spawnAngle + (1 - condenseEase) * g.driftCurve;

                gx = beadX + Math.cos(angleInAir) * distFromBead;
                gy = beadY + Math.sin(angleInAir) * distFromBead;

                // Песчинка плавно проявляется прямо из воздуха, мерцает и вливается в растущий шарик
                const twinkle = 0.78 + 0.22 * Math.sin(t * 9.5 + m * 1.9);
                const fadeEnvelope =
                  Math.min(1, localT / 0.28) * (localT > 0.78 ? Math.max(0, 1 - (localT - 0.78) / 0.22) : 1);
                gAlpha = fadeEnvelope * twinkle * 0.92;
                gRadius = g.radius * (0.75 + 0.35 * Math.sin(localT * Math.PI));
              }

              if (gAlpha <= 0.02) continue;

              // Рисуем изящную перламутровую песчинку (тонкое яркое ядро + нежное свечение 1.8px)
              const glowR = gRadius * 2.1;
              const gGrad = ctx.createRadialGradient(gx, gy, 0, gx, gy, glowR);
              gGrad.addColorStop(0, `rgba(255, 255, 255, ${gAlpha.toFixed(3)})`);
              if (g.tintIndex === 0) {
                gGrad.addColorStop(0.5, `rgba(248, 250, 255, ${(gAlpha * 0.65).toFixed(3)})`);
              } else if (g.tintIndex === 1) {
                gGrad.addColorStop(0.5, `rgba(186, 234, 255, ${(gAlpha * 0.68).toFixed(3)})`);
              } else if (g.tintIndex === 2) {
                gGrad.addColorStop(0.5, `rgba(255, 204, 232, ${(gAlpha * 0.68).toFixed(3)})`);
              } else {
                gGrad.addColorStop(0.5, `rgba(220, 204, 255, ${(gAlpha * 0.68).toFixed(3)})`);
              }
              gGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

              ctx.fillStyle = gGrad;
              ctx.beginPath();
              ctx.arc(gx, gy, glowR, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // 3. ОТРИСОВКА ПЕРЛАМУТРОВОГО ХЛЫСТА, КОТОРЫЙ ИЗГИБАЕТСЯ ВДОГОНКУ ЗА ШАРИКОМ ПО ЕГО КРИВОЙ ТРАЕКТОРИИ, ОБВИВАЕТ ЕГО И РЕЗКО ТЯНЕТ НАЗАД
          if (isWhipCatchAtWall && t >= 0.14 && t <= 1.62) {
            const targetBead = p.droplets[p.whipTargetIdx];
            const bx = targetBead.wx - p.x;
            const by = targetBead.wy - p.y;
            const distToBead = Math.hypot(bx, by);

            if (distToBead > 24) {
              const ux = bx / distToBead;
              const uy = by / distToBead;
              const nx = -uy;
              const ny = ux;

              // Выброс хлыста вдогонку по кривой траектории (0.14..0.54с), удержание/рывок (0.54..1.38с) и втягивание в жемчужину (1.38..1.62с)
              let whipReach = 0;
              if (t < 0.54) {
                const uOut = Math.max(0, (t - 0.14) / 0.40);
                whipReach = 1 - Math.pow(1 - uOut, 2.5);
              } else if (t < 1.38) {
                whipReach = 1;
              } else {
                const uIn = Math.min(1, (t - 1.38) / 0.24);
                whipReach = Math.pow(1 - uIn, 1.8);
              }

              // Степень обвития шарика кольцами хлыста (0.52..0.84с — обвивает, 0.84..1.30с — держит, 1.30..1.48с — распускает)
              let wrapProg = 0;
              if (t >= 0.52 && t < 0.84) {
                wrapProg = (t - 0.52) / 0.32;
              } else if (t >= 0.84 && t < 1.30) {
                wrapProg = 1;
              } else if (t >= 1.30 && t < 1.48) {
                wrapProg = Math.max(0, 1 - (t - 1.30) / 0.18);
              }

              // Насколько сильно тело хлыста повторяет изгиб криволинейной траектории шарика:
              // во время погони (0.14..0.58с) хлыст извивается прямо по виражам полёта шарика,
              // а перед рывком назад (0.58..1.04с) натягивается в упругую струну!
              const curveFollowWeight =
                t < 0.56
                  ? 0.76
                  : t < 1.04
                    ? 0.76 * Math.pow(1 - (t - 0.56) / 0.48, 1.6)
                    : 0;

              const uBeadFlight = t < 0.54 ? 1 - Math.pow(1 - Math.min(1, t / 0.54), 2.25) : 1;
              const startR = 22;
              const targetTipR = Math.max(startR + 4, distToBead - 13);
              const currentTipR = startR + (targetTipR - startR) * whipReach;

              // Амплитуда хлесткой волны вдоль хлыста при погоне и вибрация натянутой тетивы при рывке назад
              const whipWaveAmp =
                t < 0.88
                  ? Math.sin(Math.min(1, Math.max(0, (t - 0.14) / 0.74)) * Math.PI) * 24
                  : t >= 1.04 && t <= 1.38
                    ? Math.sin((t - 1.04) * 68) * 3.8
                    : 0;

              const segs = 42;
              const centerPts: { x: number; y: number }[] = [];

              for (let s = 0; s <= segs; s++) {
                const u = s / segs; // 0..1 от основания у жемчужины до кончика хлыста
                const rAlong = startR + (currentTipR - startR) * u;
                const straightX = ux * rAlong;
                const straightY = uy * rAlong;

                // Точка на нелинейной траектории шарика (чтобы хлыст огибал те же виражи/петли в погоне)
                const trajPt = evalWhipEscapePoint(u * uBeadFlight * whipReach);
                const blendW = curveFollowWeight * Math.sin(u * Math.PI);

                const baseX = straightX + (trajPt.dx * whipReach - straightX) * blendW;
                const baseY = straightY + (trajPt.dy * whipReach - straightY) * blendW;

                const envS = Math.sin(u * Math.PI);
                const lateralWave = Math.sin(u * Math.PI * 2.6 - t * 29) * whipWaveAmp * envS;

                centerPts.push({
                  x: baseX + nx * lateralWave,
                  y: baseY + ny * lateralWave,
                });
              }

              // Строим левый и правый контуры 3D-хлыста по локальным нормалям изогнутого хребта
              const leftPts: { x: number; y: number }[] = [];
              const rightPts: { x: number; y: number }[] = [];
              const spinePts: { x: number; y: number }[] = [];

              for (let s = 0; s <= segs; s++) {
                const u = s / segs;
                const prev = centerPts[Math.max(0, s - 1)];
                const next = centerPts[Math.min(segs, s + 1)];
                const txSeg = next.x - prev.x;
                const tySeg = next.y - prev.y;
                const segLen = Math.hypot(txSeg, tySeg) || 1;
                const lnx = -tySeg / segLen;
                const lny = txSeg / segLen;

                // Толщина хлыста: широкое жидкое основание у жемчужины (9.8px) -> гибкий стебель -> кончик (2.8px)
                const yankThinning = t >= 1.04 && t <= 1.38 ? 0.76 : 1;
                const halfW = (9.8 * Math.pow(1 - u, 1.55) + 3.2 * (1 - u * 0.25)) * yankThinning;

                const cPt = centerPts[s];
                leftPts.push({ x: cPt.x + lnx * halfW, y: cPt.y + lny * halfW });
                rightPts.push({ x: cPt.x - lnx * halfW, y: cPt.y - lny * halfW });
                spinePts.push({ x: cPt.x + lnx * (halfW * 0.22), y: cPt.y + lny * (halfW * 0.22) });
              }

              ctx.save();
              ctx.shadowColor = 'rgba(29, 32, 35, 0.16)';
              ctx.shadowBlur = 8;
              ctx.shadowOffsetY = 3;

              ctx.beginPath();
              ctx.moveTo(leftPts[0].x, leftPts[0].y);
              for (let s = 1; s < leftPts.length; s++) {
                const p0 = leftPts[s - 1];
                const p1 = leftPts[s];
                ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) * 0.5, (p0.y + p1.y) * 0.5);
              }
              ctx.lineTo(leftPts[leftPts.length - 1].x, leftPts[leftPts.length - 1].y);
              for (let s = rightPts.length - 1; s >= 0; s--) {
                const p0 = rightPts[s];
                const p1 = s > 0 ? rightPts[s - 1] : rightPts[0];
                ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) * 0.5, (p0.y + p1.y) * 0.5);
              }
              ctx.closePath();

              const whipGrad = ctx.createLinearGradient(0, 0, bx, by);
              whipGrad.addColorStop(0, '#ffffff');
              whipGrad.addColorStop(0.35, '#eef6ff');
              whipGrad.addColorStop(0.7, '#fae8f6');
              whipGrad.addColorStop(1, '#e0f2fe');
              ctx.fillStyle = whipGrad;
              ctx.fill();

              // Глянцевый 3D-блик вдоль хребта хлыста
              ctx.shadowColor = 'transparent';
              ctx.beginPath();
              ctx.moveTo(spinePts[0].x, spinePts[0].y);
              for (let s = 1; s < spinePts.length; s++) {
                ctx.lineTo(spinePts[s].x, spinePts[s].y);
              }
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.94)';
              ctx.lineWidth = 2.2;
              ctx.lineCap = 'round';
              ctx.stroke();
              ctx.restore();

              // Б. Рисуем кольца хлыста, плотно ОБВИВАЮЩИЕ пойманный шарик поверх его сферы на любой траектории
              if (wrapProg > 0.02) {
                const lastSpine = centerPts[segs];
                const prevSpine = centerPts[Math.max(0, segs - 3)];
                const approachAngle = Math.atan2(lastSpine.y - prevSpine.y, lastSpine.x - prevSpine.x);
                ctx.save();
                ctx.translate(bx, by);
                ctx.rotate(approachAngle);

                const drawWrapCoil = (
                  xOffset: number,
                  tiltX: number,
                  coilProg: number,
                  thickness: number
                ) => {
                  if (coilProg <= 0.01) return;
                  const coilSteps = 22;
                  const maxIdx = Math.max(2, Math.floor(coilSteps * Math.min(1, coilProg)));
                  const rSphere = 17.5;

                  const pts: { x: number; y: number }[] = [];
                  for (let c = 0; c <= maxIdx; c++) {
                    const v = (c / coilSteps) * 2 - 1; // -1 (верхний край шара) .. +1 (нижний край шара)
                    const y = v * rSphere;
                    // 3D-изгиб витка по сферической поверхности шарика
                    const sphereBulge = Math.sqrt(Math.max(0, 1 - v * v));
                    const x = xOffset + v * tiltX + sphereBulge * 4.2;
                    pts.push({ x, y });
                  }

                  // Мягкая контактная тень витка на поверхности шарика + перламутровое тело витка
                  ctx.save();
                  ctx.shadowColor = 'rgba(29, 32, 35, 0.22)';
                  ctx.shadowBlur = 4;
                  ctx.shadowOffsetY = 1.5;

                  ctx.beginPath();
                  ctx.moveTo(pts[0].x, pts[0].y);
                  for (let c = 1; c < pts.length; c++) {
                    ctx.lineTo(pts[c].x, pts[c].y);
                  }
                  const coilGrad = ctx.createLinearGradient(-10, -rSphere, 10, rSphere);
                  coilGrad.addColorStop(0, '#dff2ff');
                  coilGrad.addColorStop(0.5, '#ffffff');
                  coilGrad.addColorStop(1, '#fbe2f4');
                  ctx.strokeStyle = coilGrad;
                  ctx.lineWidth = thickness;
                  ctx.lineCap = 'round';
                  ctx.stroke();

                  // Яркий жемчужный блик по центру витка
                  ctx.shadowColor = 'transparent';
                  ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
                  ctx.lineWidth = thickness * 0.38;
                  ctx.stroke();
                  ctx.restore();
                };

                // Первый диагональный виток хлыста вокруг шарика
                const coil1Prog = Math.min(1, wrapProg / 0.58);
                drawWrapCoil(-5.5, 4.5, coil1Prog, 5.4);

                // Второй диагональный виток хлыста ближе к вершине шарика (двойное обвитие!)
                const coil2Prog = Math.max(0, (wrapProg - 0.36) / 0.64);
                drawWrapCoil(3.2, 4.0, coil2Prog, 4.5);

                ctx.restore();
              }
            }
          }

          ctx.restore();
        }
      }

      // Жидкое ядро расширяется ровно во время натяжения лизуна или засасывания/вылезания капель, а в покое прячется внутрь сферы (без белой рамки)
      if (mainGooRef.current) {
        const gooScale = slimeStretchRatio > 0.02 || anyDropletInTransit ? 1.09 : 0.92;
        mainGooRef.current.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) scale(${(p.scaleX * gooScale).toFixed(3)}, ${(p.scaleY * gooScale).toFixed(3)})`;
        mainGooRef.current.style.borderRadius = dynamicRadius;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Захват кнопки мышкой / пальцем
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const p = physRef.current;
    p.isDragging = true;
    p.dragMoved = false;
    p.pointerStartX = e.clientX;
    p.pointerStartY = e.clientY;
    p.dragStartBtnY = p.y;
    p.grabOffsetX = e.clientX - p.x;
    p.grabOffsetY = e.clientY - p.y;
    p.pullDist = 0;
    p.lastMoveTime = performance.now();
    p.lastClientX = e.clientX;
    p.lastClientY = e.clientY;
    p.throwVx = 0;
    p.throwVy = 0;
    p.freeVx = 0;
    p.freeVy = 0;
    // Не смещаем p.mouseX / p.mouseY при клике, чтобы полукруг у стены стоял неподвижно по вертикали
    p.mouseX = p.x;
    p.mouseY = p.y;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const p = physRef.current;
    if (!p.isDragging) return;

    const now = performance.now();
    const dtMove = Math.max(0.004, (now - p.lastMoveTime) / 1000);
    const instVx = (e.clientX - p.lastClientX) / dtMove;
    const instVy = (e.clientY - p.lastClientY) / dtMove;
    p.throwVx = p.throwVx * 0.45 + instVx * 0.55;
    p.throwVy = p.throwVy * 0.45 + instVy * 0.55;
    p.lastMoveTime = now;
    p.lastClientX = e.clientX;
    p.lastClientY = e.clientY;

    const moveDist = Math.hypot(e.clientX - p.pointerStartX, e.clientY - p.pointerStartY);
    if (!p.dragMoved) {
      if (moveDist <= 5) return;
      p.dragMoved = true;
    }

    const w = window.innerWidth;

    if (p.dockSide === 'right') {
      // Плавное скольжение вдоль правой стены без рывка к центру курсора
      p.mouseY = p.dragStartBtnY + (e.clientY - p.pointerStartY);
      const pullDist = Math.max(0, p.pointerStartX - e.clientX);
      p.pullDist = pullDist;

      if (pullDist >= PEEL_THRESHOLD_PX) {
        // ОТЛИПАНИЕ от правого края!
        p.dockSide = 'floating';
        setDockSide('floating');
        p.isOpen = true;
        setIsOpen(true);
        p.pullDist = 0;
        p.grabOffsetX = 0;
        p.grabOffsetY = 0;
        p.mouseX = e.clientX;
        p.mouseY = e.clientY;
        p.nextIdleWaitSec = 6.5;
        setIsStretchingSlime(false);
        // Упругий желейный импульс отрыва капли-лизуна
        p.velScaleX = -3.8;
        p.velScaleY = 3.5;
        p.velSloshX = -4.2;
      } else {
        setIsStretchingSlime(pullDist > 6);
      }
    } else if (p.dockSide === 'left') {
      // Плавное скольжение вдоль левой стены без рывка к центру курсора
      p.mouseY = p.dragStartBtnY + (e.clientY - p.pointerStartY);
      const pullDist = Math.max(0, e.clientX - p.pointerStartX);
      p.pullDist = pullDist;

      if (pullDist >= PEEL_THRESHOLD_PX) {
        // ОТЛИПАНИЕ от левого края!
        p.dockSide = 'floating';
        setDockSide('floating');
        p.isOpen = true;
        setIsOpen(true);
        p.pullDist = 0;
        p.grabOffsetX = 0;
        p.grabOffsetY = 0;
        p.mouseX = e.clientX;
        p.mouseY = e.clientY;
        p.nextIdleWaitSec = 6.5;
        setIsStretchingSlime(false);
        p.velScaleX = -3.8;
        p.velScaleY = 3.5;
        p.velSloshX = 4.2;
      } else {
        setIsStretchingSlime(pullDist > 6);
      }
    } else {
      // В свободном полёте учитываем смещение захвата
      p.mouseX = e.clientX - p.grabOffsetX;
      p.mouseY = e.clientY - p.grabOffsetY;

      // Проверяем приближение к левому или правому краю окна
      if (e.clientX <= SNAP_THRESHOLD_PX) {
        // ПРИЛИПАНИЕ как лизун к ЛЕВОМУ краю!
        p.dockSide = 'left';
        setDockSide('left');
        p.pullDist = 0;
        p.mouseX = 0;
        p.mouseY = p.y;
        p.pointerStartX = e.clientX;
        p.pointerStartY = e.clientY;
        p.dragStartBtnY = p.y;
        p.sloshX = 0;
        p.sloshY = 0;
        p.velSloshX = 0;
        p.velSloshY = 0;
        p.splatTimer = 1;
        p.splatWallX = 0;
        setIsStretchingSlime(true);
        setTimeout(() => setIsStretchingSlime(false), 360);
        // Эффект расплющивания лизуна о стену
        p.velScaleX = -3.6;
        p.velScaleY = 3.3;
      } else if (e.clientX >= w - SNAP_THRESHOLD_PX) {
        // ПРИЛИПАНИЕ как лизун к ПРАВОМУ краю!
        p.dockSide = 'right';
        setDockSide('right');
        p.pullDist = 0;
        p.mouseX = w;
        p.mouseY = p.y;
        p.pointerStartX = e.clientX;
        p.pointerStartY = e.clientY;
        p.dragStartBtnY = p.y;
        p.sloshX = 0;
        p.sloshY = 0;
        p.velSloshX = 0;
        p.velSloshY = 0;
        p.splatTimer = 1;
        p.splatWallX = w;
        setIsStretchingSlime(true);
        setTimeout(() => setIsStretchingSlime(false), 360);
        p.velScaleX = -3.6;
        p.velScaleY = 3.3;
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const p = physRef.current;
    if (!p.isDragging) return;

    const wasPullingWall = (p.dockSide === 'right' || p.dockSide === 'left') && p.pullDist > 6;
    p.isDragging = false;
    p.pullDist = 0;
    setIsStretchingSlime(false);

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    // Если это был обычный клик
    if (!p.dragMoved) {
      if (p.dockSide === 'floating') {
        // В отлипшем режиме клик переключает шоу-анимации по очереди: 1 (горизонтальная) -> 2 (орбиты) -> 3 (засасывание и облёт)
        if (p.idleStage === 'none') {
          p.requestedNextStage = 'horiz_spin';
        } else if (p.idleStage === 'horiz_spin') {
          p.requestedNextStage = 'multi_orbits';
        } else if (p.idleStage === 'multi_orbits') {
          p.requestedNextStage = 'loop_flight';
        } else {
          p.requestedNextStage = 'none';
        }
        p.velScaleX = -2.0;
        p.velScaleY = 1.8;
      } else {
        setIsOpen((prev) => !prev);
        p.velScaleX = -1.6;
        p.velScaleY = 1.4;
      }
    } else if (wasPullingWall) {
      // Если тянули от края в сторону отрыва, но отпустили раньше порога — упруго возвращается к краю как лизун
      p.velScaleX = -2.6;
      p.velScaleY = 2.4;
    } else if (p.dockSide === 'floating') {
      // Передаём скорость толчка при отпускании мыши
      const timeSinceMove = performance.now() - p.lastMoveTime;
      const w = window.innerWidth;

      if (timeSinceMove < 120) {
        p.freeVx = p.throwVx * 1.15;
        p.freeVy = p.throwVy * 1.05;
      } else {
        p.freeVx = 0;
        p.freeVy = 0;
      }

      // Если толкнули в сторону левой стены (или отпустили недалеко от неё с импульсом влево) — летит в левую стену!
      if ((p.mouseX < 360 && p.freeVx < -60) || (p.mouseX < 125 && p.freeVx <= 10)) {
        p.freeVx = Math.min(p.freeVx, -520);
      }
      // Если толкнули в сторону правой стены (или отпустили недалеко от неё с импульсом вправо) — летит в правую стену!
      else if ((p.mouseX > w - 360 && p.freeVx > 60) || (p.mouseX > w - 125 && p.freeVx >= -10)) {
        p.freeVx = Math.max(p.freeVx, 520);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-40 pointer-events-none overflow-hidden select-none">
      {/* SVG-фильтр вязкого лизуна и капель (Metaball Gooey) */}
      <svg className="sr-only pointer-events-none" aria-hidden="true">
        <defs>
          <filter id="mts-gooey-drop" x="-300%" y="-300%" width="700%" height="700%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10"
              result="goo"
            />
            <feDropShadow
              in="goo"
              dx="0"
              dy="2"
              stdDeviation="3.5"
              floodColor="#1D2023"
              floodOpacity="0.12"
              result="shadowedGoo"
            />
            <feComposite in="SourceGraphic" in2="shadowedGoo" operator="over" />
          </filter>
        </defs>
      </svg>

      {/* СЛОЙ 1 (z-0): Жидкая метаболл-основа лизуна и капель */}
      <div className="gooey-droplet-stage absolute inset-0 z-0 pointer-events-none">
        {/* Подушка лизуна на стене и 2 узелка тянущейся шейки при отлипании/прилипании */}
        <div
          ref={wallPadRef}
          className="absolute left-0 top-0 -ml-5 -mt-11 w-10 h-22 rounded-full bg-[#F6F8FC] will-change-transform"
        />
        <div
          ref={neck1Ref}
          className="absolute left-0 top-0 -ml-5.5 -mt-5.5 w-11 h-11 rounded-full bg-[#F6F8FC] will-change-transform"
        />
        <div
          ref={neck2Ref}
          className="absolute left-0 top-0 -ml-5 -mt-5 w-10 h-10 rounded-full bg-[#F6F8FC] will-change-transform"
        />

        {/* Жидкие тела 4 шариков и их перемычек */}
        {[0, 1, 2, 3].map((index) => (
          <React.Fragment key={`goo-drop-${index}`}>
            <div
              ref={(el) => {
                bridgeGooRefs.current[index] = el;
              }}
              className="absolute left-0 top-0 -ml-3 -mt-3 w-6 h-6 rounded-full bg-[#F6F8FC] will-change-transform"
            />
            <div
              ref={(el) => {
                dropletGooRefs.current[index] = el;
              }}
              className="absolute left-0 top-0 -ml-4.5 -mt-4.5 w-9 h-9 rounded-full bg-white will-change-transform"
            />
          </React.Fragment>
        ))}

        {/* Жидкое ядро главной кнопки (чуть меньше сферы, чтобы не выступала белая кромка) */}
        <div
          ref={mainGooRef}
          className="absolute left-0 top-0 -ml-[39px] -mt-[39px] w-[78px] h-[78px] rounded-full bg-[#F2F5FA] will-change-transform"
        />
      </div>

      {/* СЛОЙ 1.5 (z-15): Прорисовываемые кольца орбит (Анимация 2) + Лёгкие волны с песчинками и перламутровый хлыст (у края) */}
      <div
        ref={orbitOverlayRef}
        className="absolute left-0 top-0 z-15 pointer-events-none will-change-transform"
      >
        {/* High-DPI Canvas (960x960) для лёгких волн, песчинок и 3D-хлыста, догоняющего шарик на дальних траекториях */}
        <canvas
          ref={waveCanvasRef}
          width={960}
          height={960}
          className="absolute left-0 top-0 -ml-[480px] -mt-[480px] w-[960px] h-[960px] pointer-events-none"
        />
        <svg
          width="320"
          height="320"
          viewBox="-160 -160 320 320"
          className="-ml-40 -mt-40 overflow-visible"
        >
          <defs>
            <linearGradient id="pearl-orbit-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#C8D4E6" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#E4D6EE" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#BCD6EC" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          {MULTI_ORBIT_RADII.map((radius, index) => (
            <circle
              key={`orbit-ring-${index}`}
              ref={(el) => {
                orbitCircleRefs.current[index] = el;
              }}
              cx="0"
              cy="0"
              r={radius}
              fill="none"
              stroke="url(#pearl-orbit-ring-grad)"
              strokeWidth="1.5"
              strokeLinecap="round"
              style={{ opacity: 0 }}
            />
          ))}
        </svg>
      </div>

      {/* СЛОЙ 2 (z-10 / z-25 при проходе спереди): 4 жемчужных 3D-шарика (на 1-м шарике — Книга, на остальных — крестики; во время анимации скрываются и переливаются перламутром) */}
      {[0, 1, 2, 3].map((index) => {
        const isBookSphere = index === 0;
        const hideIcon = isIdleShowActive || isMovingFast;

        return (
          <button
            key={`drop-btn-${index}`}
            ref={(el) => {
              dropletBtnRefs.current[index] = el;
            }}
            type="button"
            onClick={() => {
              const p = physRef.current;
              // Пока идёт любая анимация или движение — клик недоступен
              if (p.idleStage !== 'none' || p.wasMovingFast) return;

              if (isBookSphere) {
                // Нажатие на сферу с Книгой (когда сферы стоят спокойно)
                const d = p.droplets[0];
                d.scale = 1.24;
                setIsBookActivePulse(true);
                setTimeout(() => setIsBookActivePulse(false), 420);
                onOpenBook?.();
                return;
              }

              // Для остальных 3 сфер (+) у края экрана: запуск побега шарика и поимки хлыстом
              if (p.dockSide !== 'floating' && p.isOpen) {
                p.requestedWhipTarget = index;
                p.requestedNextStage = 'docked_whip_catch';
              }
            }}
            title={isBookSphere ? 'Открыть книгу' : 'Быстрое действие'}
            className={`pearl-droplet-sphere overflow-hidden border-0 outline-none group absolute left-0 top-0 z-10 -ml-4.5 -mt-4.5 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer will-change-transform ${
              isBookSphere && isBookActivePulse ? 'ring-2 ring-[#0077FF]/35' : ''
            }`}
            aria-label={isBookSphere ? 'Книга' : 'Добавить'}
          >
            {/* Яркий перламутровый слой, который плавно включается на время шоу-анимаций */}
            <span
              aria-hidden="true"
              className={`pearl-droplet-vivid-layer absolute inset-0 rounded-full pointer-events-none transition-opacity duration-500 ease-in-out ${
                isIdleShowActive ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ animationDelay: `${-index * 0.55}s` }}
            />

            {/* Иконка внутри сферы (Книга на первой сфере, + на остальных 3): скрыта пока сферы кружатся/в анимации, и проявляется когда они останавливаются */}
            <span
              key={`icon-${index}-${hideIcon ? 'hidden' : crossRevealCycle}`}
              className={`relative z-10 flex items-center justify-center text-[#56606B] ${
                hideIcon
                  ? 'droplet-cross-hidden'
                  : crossRevealCycle > 0
                    ? 'droplet-cross-materialize'
                    : ''
              }`}
              style={
                !hideIcon && crossRevealCycle > 0
                  ? { animationDelay: `${index * 65}ms` }
                  : undefined
              }
            >
              {isBookSphere ? (
                <span className="flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-112 group-hover:-translate-y-0.5">
                  {/* Детализированное изображение раскрытой книги с переплётом, страницами и закладкой */}
                  <svg
                    viewBox="0 0 24 24"
                    className="w-[17px] h-[17px] overflow-visible"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {/* Мягкая подложка раскрытых страниц */}
                    <path
                      d="M12 6.2C9.7 4.7 6.1 4.4 3.4 5.3C2.8 5.5 2.4 6.1 2.4 6.7V17.4C2.4 18.1 3.0 18.6 3.7 18.4C6.3 17.6 9.6 17.9 12 19.4C14.4 17.9 17.7 17.6 20.3 18.4C21.0 18.6 21.6 18.1 21.6 17.4V6.7C21.6 6.1 21.2 5.5 20.6 5.3C17.9 4.4 14.3 4.7 12 6.2Z"
                      fill="rgba(255, 255, 255, 0.78)"
                      stroke="#56606B"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* Центральный корешок книги */}
                    <path
                      d="M12 6.2V19.4"
                      stroke="#56606B"
                      strokeWidth="1.65"
                      strokeLinecap="round"
                    />
                    {/* Строчки текста на левой странице */}
                    <path
                      d="M5.3 9.2C6.9 8.8 8.4 9.0 9.6 9.6M5.3 12.1C6.9 11.7 8.4 11.9 9.6 12.5M5.3 15.0C6.7 14.7 7.9 14.8 9.0 15.2"
                      stroke="#6E7A87"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                    />
                    {/* Строчки текста на правой странице */}
                    <path
                      d="M18.7 9.2C17.1 8.8 15.6 9.0 14.4 9.6M18.7 12.1C17.1 11.7 15.6 11.9 14.4 12.5"
                      stroke="#6E7A87"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                    />
                    {/* Маленькая закладка-ленточка */}
                    <path
                      d="M15.8 5.2V10.6L17.1 9.5L18.4 10.6V5.1"
                      fill="rgba(227, 6, 19, 0.16)"
                      stroke="#E30613"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              ) : (
                <span className="flex items-center justify-center transition-transform duration-500 ease-in-out group-hover:rotate-360">
                  <Plus className="w-4 h-4 stroke-[2.2]" />
                </span>
              )}
            </span>
          </button>
        );
      })}

      {/* СЛОЙ 2.5 (z-26): Преломление орбитальных линий СКВОЗЬ капли (капли идут по линиям и пропускают их сквозь себя) */}
      <div
        ref={orbitThroughOverlayRef}
        className="absolute left-0 top-0 z-26 pointer-events-none will-change-transform"
      >
        <svg
          width="320"
          height="320"
          viewBox="-160 -160 320 320"
          className="-ml-40 -mt-40 overflow-visible"
        >
          <defs>
            <linearGradient id="pearl-orbit-through-glow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.88" />
              <stop offset="50%" stopColor="#E9D5FF" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#F9A8D4" stopOpacity="0.88" />
            </linearGradient>
            <filter id="pearl-thread-refract" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="0.9" result="softGlow" />
              <feMerge>
                <feMergeNode in="softGlow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {[0, 1, 2, 3].map((index) => (
            <g key={`orbit-through-group-${index}`} filter="url(#pearl-thread-refract)">
              {/* Мягкое перламутровое преломление линии внутри полупрозрачного тела капли */}
              <path
                ref={(el) => {
                  orbitInnerArcRefs.current[index] = el;
                }}
                fill="none"
                stroke="url(#pearl-orbit-through-glow)"
                strokeWidth="2.8"
                strokeLinecap="round"
                style={{ opacity: 0 }}
              />
              {/* Чёткая световая сердцевина линии, проходящей сквозь центр капли */}
              <path
                ref={(el) => {
                  orbitInnerCoreRefs.current[index] = el;
                }}
                fill="none"
                stroke="rgba(255, 255, 255, 0.96)"
                strokeWidth="1.25"
                strokeLinecap="round"
                style={{ opacity: 0 }}
              />
              {/* Световые мениски в точках входа и выхода орбитальной линии на границе капли */}
              <circle
                ref={(el) => {
                  orbitEntryDotRefs.current[index] = el;
                }}
                r="2.1"
                fill="#FFFFFF"
                stroke="#C4B5FD"
                strokeWidth="0.8"
                style={{ opacity: 0 }}
              />
              <circle
                ref={(el) => {
                  orbitExitDotRefs.current[index] = el;
                }}
                r="2.1"
                fill="#FFFFFF"
                stroke="#93C5FD"
                strokeWidth="0.8"
                style={{ opacity: 0 }}
              />
            </g>
          ))}
        </svg>
      </div>

      {/* СЛОЙ 3 (z-20): Главная фигура «лизун» с 3D-шарообразным объёмом и переливом белого перламутра без окантовки */}
      <button
        ref={mainBtnRef}
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="pearl-slime-sphere overflow-hidden border-0 outline-none absolute left-0 top-0 z-20 -ml-[43px] -mt-[43px] w-[86px] h-[86px] rounded-full pointer-events-auto cursor-grab active:cursor-grabbing will-change-transform"
        aria-label="Быстрое меню"
      />
    </div>
  );
};
