import * as THREE from 'three';
// eslint-disable-next-line import/no-unresolved
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import CustomShaderMaterial from 'three-custom-shader-material/vanilla';
import { Pane } from 'tweakpane';
import { throttle } from 'lodash';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import bgFragment from '../shaders/bg/fragment.glsl';
import bgVertex from '../shaders/bg/vertex.glsl';
import fragment from '../shaders/fragment.glsl';
import vertex from '../shaders/vertex.glsl';

const device = {
  width: window.innerWidth,
  height: window.innerHeight,
  pixelRatio: window.devicePixelRatio
};

export default class Three {
  constructor(canvas) {
    this.canvas = canvas;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.isHovered = false;
    
    this.scene = new THREE.Scene();
    this.bgScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      device.width / device.height,
      0.1,
      100
    );
    this.camera.position.set(0, 0, 6.5);
    const frustumSize = 1;
    // 生成正交相机
    this.bgCamera = new THREE.OrthographicCamera(
      frustumSize / device.pixelRatio / -2,
      frustumSize / device.pixelRatio / 2,
      frustumSize / device.pixelRatio / 2,
      frustumSize / device.pixelRatio / -2,
      -1000,
      1000
    );
    this.bgCamera.position.set(0, 0, 2);
    this.bgScene.add(this.bgCamera);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance"
    });

    this.renderer.setSize(device.width, device.height);
    this.renderer.setPixelRatio(Math.min(device.pixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.bgRenderTarget = new THREE.WebGLRenderTarget(
      device.width,
      device.height,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        precision: 'highp',
        colorSpace: THREE.SRGBColorSpace,
        antialias: true,
      }
    );

    // 开启阴影渲染
    this.renderer.shadowMap.enabled = false;
    // 设定透明 background
    this.renderer.setClearColor(0x00_00_00, 0);
    this.controls = new OrbitControls(this.camera, this.canvas);

    this.clock = new THREE.Clock();

    this.setDebug();
    this.setLights();
    this.setEnv('./lake_pier_2k.hdr');
    this.setBackGround();
    this.setGeometry();
    this.bgPostProcess();
    this.render();
    this.setResize();

    // 修改事件监听为节流模式
    window.addEventListener('mousemove', throttle((e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    }, 100)); // 100ms 节流
  }

  //#region
  setDebug() {
    this.uniforms = {
      uTime: new THREE.Uniform(0),
      uPositionFrequency: new THREE.Uniform(0.6),
      uTimeFrequency: new THREE.Uniform(0.95),
      uNoiseFrequency: new THREE.Uniform(0.5),
      uNoiseTimeFrequency: new THREE.Uniform(0.3),
      uNoiseStrength: new THREE.Uniform(2.3),
      uColor: new THREE.Uniform(new THREE.Color('#fff')),
      uStrength: new THREE.Uniform(0.115),
      colorA: new THREE.Uniform(new THREE.Color('#fff')), // New colorA uniform
      colorB: new THREE.Uniform(new THREE.Color('#fff')), // New colorB uniform
      uMouseFactor: new THREE.Uniform(1) // 初始值为1.0
    };

    this.materialParams = {
      metalness: 0.07,
      roughness: 0.18,
      color: new THREE.Color('#fff'),
      transmission: 1,
      ior: 1.9,
      thickness: 1.44
    };

    const pane = new Pane();
    const debugFolder = pane.addFolder({ title: 'Debug' });

    debugFolder.addBinding(this.uniforms.uPositionFrequency, 'value', {
      label: 'Position Frequency',
      step: 0.005,
      min: 0,
      max: 2.5
    });

    debugFolder.addBinding(this.uniforms.uTimeFrequency, 'value', {
      label: 'Time Frequency',
      step: 0.005,
      min: 0,
      max: 2.5
    });

    // For the color, assuming you want to bind it as an interactive color picker
    debugFolder.addBinding(this.uniforms.uColor, 'value', {
      label: 'Color',
      view: 'color',
      color: { type: 'float' }
    });

    debugFolder.addBinding(this.uniforms.uStrength, 'value', {
      label: 'Strength',
      step: 0.005,
      min: 0,
      max: 2.5
    });
    // New uniforms for noise parameters
    debugFolder.addBinding(this.uniforms.uNoiseFrequency, 'value', {
      step: 0.005,
      min: 0,
      max: 2.5,
      label: 'Noise Frequency'
    });

    debugFolder.addBinding(this.uniforms.uNoiseTimeFrequency, 'value', {
      step: 0.005,
      min: 0,
      max: 2.5,
      label: 'Noise Time Frequency'
    });

    debugFolder.addBinding(this.uniforms.uNoiseStrength, 'value', {
      step: 0.005,
      min: 0,
      max: 2.5,
      label: 'Noise Strength'
    });

    // Bindings for colorA and colorB with color: { type: 'float' }
    debugFolder.addBinding(this.uniforms.colorA, 'value', {
      view: 'color',
      color: { type: 'float' }, // Added color type as float
      label: 'Color A'
    });

    debugFolder.addBinding(this.uniforms.colorB, 'value', {
      view: 'color',
      color: { type: 'float' }, // Added color type as float
      label: 'Color B'
    });

    // Separate folder for material parameters
    const materialParametersFolder = pane.addFolder({
      title: 'Material Parameters'
    });

    // GUI for materialParams with appropriate steps, ranges, and views, using 'value' and 'onChange'
    materialParametersFolder
      .addBinding(this.materialParams, 'metalness', {
        step: 0.01,
        min: 0,
        max: 1
      })
      .on('change', ({ value }) => {
        this.sphereMaterial.metalness = value; // Update metalness in real-time
      });

    materialParametersFolder
      .addBinding(this.materialParams, 'roughness', {
        step: 0.01,
        min: 0,
        max: 1
      })
      .on('change', ({ value }) => {
        this.sphereMaterial.roughness = value; // Update roughness in real-time
      });

    materialParametersFolder
      .addBinding(this.materialParams, 'color', {
        view: 'color',
        color: { type: 'float' }
      })
      .on('change', ({ value }) => {
        this.sphereMaterial.color.set(new THREE.Color(value)); // Update color in real-time
      });

    materialParametersFolder
      .addBinding(this.materialParams, 'transmission', {
        step: 0.01,
        min: 0,
        max: 1
      })
      .on('change', ({ value }) => {
        this.sphereMaterial.transmission = value; // Update transmission in real-time
      });

    materialParametersFolder
      .addBinding(this.materialParams, 'ior', {
        step: 0.1,
        min: 1,
        max: 2.5
      })
      .on('change', ({ value }) => {
        this.sphereMaterial.ior = value; // Update index of refraction in real-time
      });

    // Modify 'thickness' to bind to the 'value' field with 'onChange'
    materialParametersFolder
      .addBinding(this.materialParams, 'thickness', {
        step: 0.01,
        min: 0,
        max: 10
      })
      .on('change', ({ value }) => {
        this.sphereMaterial.thickness = value; // Update thickness in real-time
      });
  }
  //#endregion

  // 分离检测逻辑
  checkHover() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.sphereMesh);
    this.isHovered = intersects.length > 0;
  }

  setLights() {
    const directionalLight = new THREE.DirectionalLight('#fe917d', 10);
    directionalLight.position.set(0, 0, 5);
    const directionalLightHelper = new THREE.DirectionalLightHelper(directionalLight, 5);
    // this.scene.add(directionalLightHelper);
    directionalLight.castShadow = true; // 启用阴影投射
    directionalLight.shadow.mapSize.width = 512;
    directionalLight.shadow.mapSize.height = 512;
    this.scene.add(directionalLight);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
  }

  setEnv(hdrPath) {
    const rgbeLoader = new RGBELoader();
    rgbeLoader.setDataType(THREE.UnsignedByteType);
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    rgbeLoader.load(hdrPath, (texture) => {
      const environmentMap =
        pmremGenerator.fromEquirectangular(texture).texture;
      this.scene.environment = environmentMap;
      this.scene.environmentIntensity = 1.5;
    });
  }

  setGeometry() {
    this.group = new THREE.Group();

    const textureLoader = new THREE.TextureLoader();
    const matcap = textureLoader.load('./matcap.png');
    // 利用 csm 创建一个基于物理材质的球体
    let sphereGeometry = new THREE.IcosahedronGeometry(2.5, 128);
    sphereGeometry.center();
    sphereGeometry = BufferGeometryUtils.mergeVertices(sphereGeometry);
    sphereGeometry.computeTangents();

    this.sphereMaterial = new CustomShaderMaterial({
      baseMaterial: THREE.MeshPhysicalMaterial,
      metalness: this.materialParams.metalness,
      roughness: this.materialParams.roughness,
      color: this.materialParams.color,
      transmission: this.materialParams.transmission,
      ior: this.materialParams.ior,
      thickness: this.materialParams.thickness,
      transparent: true,
      wireframe: false,
      fragmentShader: fragment,
      vertexShader: vertex,
      uniforms: this.uniforms
    });
    // this.sphereMaterial.flatShading = true; // 开启平滑渲染
    // 创建深度材质 用于渲染物体的深度 修复阴影问题
    const depthMaterial = new CustomShaderMaterial({
      baseMaterial: THREE.MeshDepthMaterial,
      wireframe: false,
      vertexShader: vertex,
      // 一种特殊的深度信息打包方式，bit-packing，将深度信息分成4个通道，分别存储在RGBA各个通道中 而不是往常的白近黑远
      depthPacking: THREE.RGBADepthPacking,
      uniforms: this.uniforms
    });
    this.sphereMesh = new THREE.Mesh(sphereGeometry, this.sphereMaterial);
    this.sphereMesh.castShadow = false;
    this.sphereMesh.receiveShadow = false;
    this.sphereMesh.customDepthMaterial = depthMaterial;

    const insideSphereGeometry = new THREE.CapsuleGeometry(1.2, 0.9, 4, 8);
    const insideSphereMaterial = new THREE.MeshMatcapMaterial({
      matcap: matcap
    });
    this.insideSphereMesh = new THREE.Mesh(
      insideSphereGeometry,
      insideSphereMaterial
    );
    this.group.add(this.insideSphereMesh);
    this.group.add(this.sphereMesh);
    this.group.position.set(0, -1.1, 0);
    this.scene.add(this.group);
  }

  setBackGround() {
    this.params = {
      smoothMin: 0.05,
      leftLen: -1.5,
      rightLen: 1.04,
      xOffset: 0.5, // 新增 X 轴偏移
      yOffset: 2 // 新增 Y 轴偏移
    };

    this.planeGeometry = new THREE.PlaneGeometry(1, 1, 16, 16);
    this.planeMaterial = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      wireframe: false,
      fragmentShader: bgFragment,
      vertexShader: bgVertex,
      uniforms: {
        uProgress: { type: 'f', value: 0 },
        uTime: { type: 'f', value: 0 },
        uResolution: {
          type: 'v2', // Change to 'v2' for a vector
          value: new THREE.Vector2(device.width / device.height, 1) // Set to width and height
        },
        uTexture: { type: 't', value: null },
        uMatcap: {
          value: new THREE.TextureLoader().load(
            './img/EE4128_FC8E82_9A0704_BF0F05.png'
          )
        },
        uCameraPosition: {
          type: 'v3',
          value: this.bgCamera.position
        },
        uSmoothMin: { type: 'f', value: this.params.smoothMin },
        uMouse: { type: 'v2', value: new THREE.Vector2(0, 0) }, // Initialize uMouse
        uLeftLength: { type: 'f', value: this.params.leftLen },
        uRightLength: { type: 'f', value: this.params.rightLen },
        uXoffset: { type: 'f', value: this.params.xOffset }, // 新增 X 轴偏移
        uYoffset: { type: 'f', value: this.params.yOffset } // 新增 Y 轴偏移
      }
    });
    this.planeMaterial.needsUpdate = true;
    this.planeMesh = new THREE.Mesh(this.planeGeometry, this.planeMaterial);
    this.bgScene.add(this.planeMesh);
  }

  addRenderTargetPlane() {
    // Create a plane geometry
    const planeGeometry = new THREE.PlaneGeometry(2, 2);

    this.bgRenderTarget.texture.colorSpace = THREE.SRGBColorSpace;
    // Create a basic material with the render target's texture
    const planeMaterial = new THREE.MeshBasicMaterial({
      map: this.bgRenderTarget.texture
    });

    // Create the mesh
    this.renderTargetPlaneMesh = new THREE.Mesh(planeGeometry, planeMaterial);

    // Position the plane mesh appropriately
    // Adjust the position based on your scene setup
    this.renderTargetPlaneMesh.position.set(0, 0, 5); // Example position

    // Add the mesh to the scene
    this.scene.add(this.renderTargetPlaneMesh);
  }
  bgPostProcess() {
    this.composer = new EffectComposer(this.renderer, this.bgRenderTarget);
    const bgRenderPass = new RenderPass(this.bgScene, this.bgCamera);
    const outputPass = new OutputPass();
    outputPass.toneMapping = THREE.NoToneMapping; // ✅ 关闭色调映射
    outputPass.toneMappingExposure = 1;
    this.composer.addPass(bgRenderPass);
    this.composer.addPass(outputPass);
  }
  render() {
    const elapsedTime = this.clock.getElapsedTime();
    const delta = this.clock.getDelta(); // 获取时间增量

    this.checkHover();
    // 平滑过渡鼠标影响因子
    const targetFactor = this.isHovered ? 1.75 : 1;

    this.uniforms.uMouseFactor.value +=
      (targetFactor - this.uniforms.uMouseFactor.value) * 5 * 0.01;

    this.uniforms.uTime.value = Math.cos(elapsedTime) * 1.5;
    this.planeMaterial.uniforms.uTime.value = elapsedTime;

    // 让sphere 自转
    this.sphereMesh.rotation.y = elapsedTime * 0.2;
    // Render the background scene using EffectComposer
    this.composer.render();
    // Use the render target's texture as the background for the main scene
    this.scene.background = this.bgRenderTarget.texture;
    // Render the main scene
    this.renderer.setRenderTarget(null); // Switch back to the default framebuffer

    requestAnimationFrame(this.render.bind(this));
    this.renderer.render(this.scene, this.camera);
  }

  setResize() {
    window.addEventListener('resize', this.onResize.bind(this));
  }

  onResize() {
    device.width = window.innerWidth;
    device.height = window.innerHeight;

    this.camera.aspect = device.width / device.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(device.width, device.height);
    this.renderer.setPixelRatio(Math.min(device.pixelRatio, 2));

    // 更新背景正交相机
    const aspect = device.width / device.height;
    this.bgCamera.left = -aspect / 2;
    this.bgCamera.right = aspect / 2;
    this.bgCamera.top = 0.5;
    this.bgCamera.bottom = -0.5;
    this.bgCamera.updateProjectionMatrix();

    // 更新渲染器和 RenderTarget
    this.renderer.setSize(device.width, device.height);
    this.bgRenderTarget.setSize(device.width, device.height);
    this.planeMaterial.uniforms.uResolution.value.set(device.width, device.height);
  }
}
