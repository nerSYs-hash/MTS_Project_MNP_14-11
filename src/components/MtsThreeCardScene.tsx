import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface MtsThreeCardSceneProps {
  type: 'new' | 'update' | 'fix' | 'remove';
  className?: string;
}

export const MtsThreeCardScene: React.FC<MtsThreeCardSceneProps> = ({ type, className = '' }) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 240;
    const height = container.clientHeight || 200;

    // Сцена
    const scene = new THREE.Scene();

    // Камера (приближена для крупного и четкого отображения 3D объектов)
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 4.3);

    // Рендерер с прозрачным альфа-каналом (фон карточки плавно просвечивает насквозь)
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    // Освещение в стиле мягкой студии МТС
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
    dirLight.position.set(5, 8, 6);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xd9e5ff, 1.0);
    fillLight.position.set(-6, -2, 4);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xff99aa, 1.5, 20);
    rimLight.position.set(2, 4, -3);
    scene.add(rimLight);

    // Главная группа объектов
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // Материалы фирменного стиля МТС
    const mtsRed = 0xe30613;
    const mtsPastelBlue = 0x6aa9ff;
    const mtsSoftPurple = 0x8a70ea;
    const mtsWarmYellow = 0xffb732;
    const mtsSilver = 0xe8ecf2;

    const redClayMaterial = new THREE.MeshPhysicalMaterial({
      color: mtsRed,
      roughness: 0.35,
      metalness: 0.05,
      clearcoat: 0.3,
      clearcoatRoughness: 0.2,
    });

    const blueClayMaterial = new THREE.MeshPhysicalMaterial({
      color: mtsPastelBlue,
      roughness: 0.3,
      metalness: 0.05,
      clearcoat: 0.4,
    });

    const silverStarMaterial = new THREE.MeshPhysicalMaterial({
      color: mtsSilver,
      metalness: 0.85,
      roughness: 0.2,
      clearcoat: 0.8,
    });

    const frostedGlassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.85,
      opacity: 1,
      transparent: true,
      roughness: 0.15,
      ior: 1.45,
      thickness: 0.5,
    });

    // Функция создания 3D звезды
    const createStarMesh = (radius: number, innerRadius: number, points: number, depth: number) => {
      const shape = new THREE.Shape();
      const step = Math.PI / points;
      for (let i = 0; i < 2 * points; i++) {
        const r = i % 2 === 0 ? radius : innerRadius;
        const angle = i * step - Math.PI / 2;
        const x = r * Math.cos(angle);
        const y = r * Math.sin(angle);
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      shape.closePath();

      const extrudeSettings = {
        depth: depth,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize: 0.08,
        bevelThickness: 0.08,
      };
      return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    };

    // Сборка 3D композиции в зависимости от типа карточки
    if (type === 'new') {
      // 1. НОВОЕ: 3D красный ступенчатый пьедестал, серебряная звезда и стрелка вверх
      const stepGroup = new THREE.Group();

      // Ступени пьедестала
      const step1Geo = new THREE.BoxGeometry(1.6, 0.45, 1.4);
      const step1 = new THREE.Mesh(step1Geo, redClayMaterial);
      step1.position.set(-0.2, -1.1, 0);
      stepGroup.add(step1);

      const step2Geo = new THREE.BoxGeometry(1.3, 0.45, 1.2);
      const step2 = new THREE.Mesh(step2Geo, redClayMaterial);
      step2.position.set(-0.05, -0.65, 0);
      stepGroup.add(step2);

      const step3Geo = new THREE.BoxGeometry(1.0, 0.45, 1.0);
      const step3 = new THREE.Mesh(step3Geo, redClayMaterial);
      step3.position.set(0.1, -0.2, 0);
      stepGroup.add(step3);

      // Основание звезды
      const baseGeo = new THREE.CylinderGeometry(0.35, 0.38, 0.15, 24);
      const starBase = new THREE.Mesh(baseGeo, silverStarMaterial);
      starBase.position.set(0.1, 0.1, 0);
      stepGroup.add(starBase);

      // Звезда
      const starGeo = createStarMesh(0.55, 0.28, 5, 0.15);
      starGeo.center();
      const starMesh = new THREE.Mesh(starGeo, silverStarMaterial);
      starMesh.position.set(0.1, 0.75, 0);
      stepGroup.add(starMesh);

      // Изогнутая стрелка роста (кривая Безье в 3D)
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-1.4, -1.0, 0.4),
        new THREE.Vector3(-0.8, -0.2, 0.6),
        new THREE.Vector3(0.1, 0.3, 0.5),
        new THREE.Vector3(1.1, 1.2, 0.3),
      ]);
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.08, 12, false);
      const tubeMesh = new THREE.Mesh(tubeGeo, blueClayMaterial);
      stepGroup.add(tubeMesh);

      // Наконечник стрелки
      const coneGeo = new THREE.ConeGeometry(0.2, 0.4, 16);
      const coneMesh = new THREE.Mesh(coneGeo, blueClayMaterial);
      coneMesh.position.set(1.15, 1.3, 0.3);
      coneMesh.rotation.z = -Math.PI / 4;
      stepGroup.add(coneMesh);

      // Парящая полупрозрачная матовая сфера
      const glassSphereGeo = new THREE.SphereGeometry(0.4, 32, 32);
      const glassSphere = new THREE.Mesh(glassSphereGeo, frostedGlassMaterial);
      glassSphere.position.set(-1.1, 0.6, -0.5);
      stepGroup.add(glassSphere);

      rootGroup.add(stepGroup);
      rootGroup.position.set(0.2, -0.1, 0);
      rootGroup.rotation.y = -0.3;
      rootGroup.rotation.x = 0.15;
    } else if (type === 'update') {
      // 2. ОБНОВЛЕНИЕ: 3D монета с круговыми стрелками синхронизации и орбитальное кольцо
      const updateGroup = new THREE.Group();

      // Монета обновления
      const coinMat = new THREE.MeshPhysicalMaterial({
        color: mtsSoftPurple,
        roughness: 0.25,
        metalness: 0.2,
        clearcoat: 0.5,
      });
      const coinGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.3, 40);
      const coin = new THREE.Mesh(coinGeo, coinMat);
      coin.rotation.x = Math.PI / 3;
      coin.rotation.z = -Math.PI / 6;
      updateGroup.add(coin);

      // Объемное кольцо орбиты
      const ringGeo = new THREE.TorusGeometry(1.6, 0.07, 16, 64);
      const ringMat = new THREE.MeshPhysicalMaterial({
        color: mtsRed,
        roughness: 0.2,
        metalness: 0.1,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2.5;
      ring.rotation.y = -Math.PI / 6;
      updateGroup.add(ring);

      // Парящая сфера данных
      const sphereGeo = new THREE.SphereGeometry(0.5, 32, 32);
      const sphereMat = new THREE.MeshPhysicalMaterial({
        color: mtsPastelBlue,
        roughness: 0.3,
        clearcoat: 0.6,
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.set(1.1, 0.6, 0.2);
      updateGroup.add(sphere);

      // Стеклянная капсула
      const capsuleGeo = new THREE.CapsuleGeometry(0.25, 0.7, 16, 24);
      const glassCapsule = new THREE.Mesh(capsuleGeo, frostedGlassMaterial);
      glassCapsule.position.set(-1.0, 0.8, -0.2);
      glassCapsule.rotation.z = Math.PI / 4;
      updateGroup.add(glassCapsule);

      rootGroup.add(updateGroup);
      rootGroup.position.set(0.1, 0.0, 0);
    } else if (type === 'fix') {
      // 3. ИСПРАВЛЕНИЕ: 3D красный тактильный калькулятор с кнопками точности и шестеренка
      const fixGroup = new THREE.Group();

      // Корпус калькулятора (скругленный бокс)
      const bodyGeo = new THREE.BoxGeometry(1.5, 2.0, 0.35);
      const body = new THREE.Mesh(bodyGeo, redClayMaterial);
      fixGroup.add(body);

      // Экранчик калькулятора
      const screenGeo = new THREE.BoxGeometry(1.15, 0.5, 0.08);
      const screenMat = new THREE.MeshPhysicalMaterial({
        color: 0xf5f7fb,
        roughness: 0.2,
        clearcoat: 0.7,
      });
      const screen = new THREE.Mesh(screenGeo, screenMat);
      screen.position.set(0, 0.55, 0.16);
      fixGroup.add(screen);

      // Кнопки калькулятора (мягкие синие пилюли)
      const btnGeo1 = new THREE.CylinderGeometry(0.24, 0.24, 0.15, 24);
      btnGeo1.rotateX(Math.PI / 2);
      const btn1 = new THREE.Mesh(btnGeo1, blueClayMaterial);
      btn1.position.set(-0.32, -0.05, 0.16);
      fixGroup.add(btn1);

      const btn2 = new THREE.Mesh(btnGeo1, blueClayMaterial);
      btn2.position.set(-0.32, -0.55, 0.16);
      fixGroup.add(btn2);

      const btnCapsuleGeo = new THREE.CapsuleGeometry(0.22, 0.45, 12, 16);
      const btn3 = new THREE.Mesh(btnCapsuleGeo, blueClayMaterial);
      btn3.position.set(0.32, -0.3, 0.16);
      fixGroup.add(btn3);

      // Матовая шестеренка рядом (символ исправлений и настройки)
      const gearGeo = new THREE.TorusGeometry(0.6, 0.14, 12, 32);
      const gearMat = new THREE.MeshPhysicalMaterial({
        color: mtsWarmYellow,
        roughness: 0.3,
        metalness: 0.2,
      });
      const gear = new THREE.Mesh(gearGeo, gearMat);
      gear.position.set(-1.1, -0.3, -0.4);
      gear.rotation.y = 0.5;
      fixGroup.add(gear);

      rootGroup.add(fixGroup);
      rootGroup.position.set(0.1, 0.0, 0);
      rootGroup.rotation.y = -0.35;
      rootGroup.rotation.x = 0.2;
      rootGroup.rotation.z = -0.1;
    } else if (type === 'remove') {
      // 4. УДАЛЕНО: Парящие матовые стеклянные лепестки и глянцевый диск чистоты
      const removeGroup = new THREE.Group();

      // Диск-платформа
      const discGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.18, 36);
      const disc = new THREE.Mesh(discGeo, redClayMaterial);
      disc.position.set(0.1, -0.8, 0);
      disc.rotation.x = Math.PI / 3.5;
      removeGroup.add(disc);

      // 3D объемное синее сердечко / капля
      const heartShape = new THREE.Shape();
      const x = 0, y = 0;
      heartShape.moveTo(x + 0.25, y + 0.25);
      heartShape.bezierCurveTo(x + 0.25, y + 0.25, x + 0.2, y, x, y);
      heartShape.bezierCurveTo(x - 0.3, y, x - 0.3, y + 0.35, x - 0.3, y + 0.35);
      heartShape.bezierCurveTo(x - 0.3, y + 0.55, x - 0.1, y + 0.77, x + 0.25, y + 0.95);
      heartShape.bezierCurveTo(x + 0.6, y + 0.77, x + 0.8, y + 0.55, x + 0.8, y + 0.35);
      heartShape.bezierCurveTo(x + 0.8, y + 0.35, x + 0.8, y, x + 0.5, y);
      heartShape.bezierCurveTo(x + 0.35, y, x + 0.25, y + 0.25, x + 0.25, y + 0.25);

      const heartExtrude = new THREE.ExtrudeGeometry(heartShape, {
        depth: 0.2,
        bevelEnabled: true,
        bevelSegments: 4,
        bevelSize: 0.05,
        bevelThickness: 0.05,
      });
      heartExtrude.center();
      const heartMesh = new THREE.Mesh(heartExtrude, blueClayMaterial);
      heartMesh.position.set(-0.6, -0.1, 0.3);
      heartMesh.rotation.z = Math.PI;
      heartMesh.scale.set(0.9, 0.9, 0.9);
      removeGroup.add(heartMesh);

      // Парящая полупрозрачная матовая стеклянная пластина
      const glassPillGeo = new THREE.BoxGeometry(1.6, 0.7, 0.08);
      const glassPill = new THREE.Mesh(glassPillGeo, frostedGlassMaterial);
      glassPill.position.set(0.2, 0.4, 0.1);
      glassPill.rotation.z = -Math.PI / 8;
      glassPill.rotation.y = 0.2;
      removeGroup.add(glassPill);

      // Легкая тонкая орбитальная дуга
      const archCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-1.4, -0.8, -0.2),
        new THREE.Vector3(-0.4, 1.2, 0.2),
        new THREE.Vector3(1.3, 0.2, -0.1),
      ]);
      const archGeo = new THREE.TubeGeometry(archCurve, 32, 0.04, 10, false);
      const archMesh = new THREE.Mesh(archGeo, blueClayMaterial);
      removeGroup.add(archMesh);

      rootGroup.add(removeGroup);
      rootGroup.position.set(0.1, 0.0, 0);
    }

    // Анимация плавного парения в реальном времени
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();

      // Мягкое естественное дыхание и покачивание 3D объектов
      rootGroup.position.y += Math.sin(elapsed * 1.5) * 0.0012;
      rootGroup.rotation.y += Math.cos(elapsed * 1.0) * 0.0015;

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // Очистка при размонтировании
    return () => {
      cancelAnimationFrame(animationFrameId);
      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      scene.clear();
    };
  }, [type]);

  return <div ref={mountRef} className={`w-full h-full relative overflow-hidden ${className}`} />;
};
