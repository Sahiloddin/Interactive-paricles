import * as THREE from 'three';

const vertexShader = `
uniform float uTime;
uniform float uPixelRatio;
uniform float uGlow; 

attribute float aScale;
attribute vec3 aTarget;
attribute vec3 aColor;

varying vec3 vColor;
varying float vGlow;

void main() {
    vGlow = uGlow;
    // Mix target based on some factor? Handled in JS for now.
    vec3 pos = position; 
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Size attenuation
    // Scale up slightly with glow
    float size = aScale * uPixelRatio * (10.0 / -mvPosition.z) * (1.0 + uGlow * 0.5);
    gl_PointSize = size;
    vColor = aColor;
}
`;

const fragmentShader = `
varying vec3 vColor;
varying float vGlow;

void main() {
    // Soft particle texture procedural
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float dist = length(xy);
    
    if (dist > 0.5) discard;
    
    // Soft edge
    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
    
    // Add glow boost to color
    vec3 finalColor = vColor + vec3(vGlow * 0.5); 
    
    gl_FragColor = vec4(finalColor, alpha);
}
`;

export class ParticleSystem {
    constructor(scene, count = 2000) {
        this.scene = scene;
        this.count = count;

        this.geometry = new THREE.BufferGeometry();
        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
                uGlow: { value: 0.0 }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.initParticles();

        this.points = new THREE.Points(this.geometry, this.material);
        this.scene.add(this.points);

        this.templates = {};
        this.generateTemplates();
        this.currentTarget = 'random';

        // State for animations
        this.wavePhase = 0;
        this.isWaving = false;
        this.expanded = false;
    }

    initParticles() {
        const positions = new Float32Array(this.count * 3);
        const scales = new Float32Array(this.count);
        const colors = new Float32Array(this.count * 3);
        const targets = new Float32Array(this.count * 3);

        for (let i = 0; i < this.count; i++) {
            const i3 = i * 3;
            positions[i3] = (Math.random() - 0.5) * 10;
            positions[i3 + 1] = (Math.random() - 0.5) * 10;
            positions[i3 + 2] = (Math.random() - 0.5) * 10;

            scales[i] = Math.random();

            // Base colors (Cosmic palette)
            colors[i3] = 0.2 + Math.random() * 0.3; // R
            colors[i3 + 1] = 0.4 + Math.random() * 0.4; // G
            colors[i3 + 2] = 0.8 + Math.random() * 0.2; // B
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
        this.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
        this.geometry.setAttribute('aTarget', new THREE.BufferAttribute(targets, 3));
    }

    generateTemplates() {
        // 1. Random / Cloud
        const random = new Float32Array(this.count * 3);
        for (let i = 0; i < this.count * 3; i++) random[i] = (Math.random() - 0.5) * 12;
        this.templates.random = random;

        // 2. Sphere
        const sphere = new Float32Array(this.count * 3);
        for (let i = 0; i < this.count; i++) {
            const i3 = i * 3;
            const r = 4;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            sphere[i3] = r * Math.sin(phi) * Math.cos(theta);
            sphere[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            sphere[i3 + 2] = r * Math.cos(phi);
        }
        this.templates.sphere = sphere;

        // 3. Cube
        const cube = new Float32Array(this.count * 3);
        for (let i = 0; i < this.count; i++) {
            const i3 = i * 3;
            const s = 5;
            cube[i3] = (Math.random() - 0.5) * s;
            cube[i3 + 1] = (Math.random() - 0.5) * s;
            cube[i3 + 2] = (Math.random() - 0.5) * s;
        }
        this.templates.cube = cube;

        // 4. Galaxy / Saturn
        const saturn = new Float32Array(this.count * 3);
        const sphereCount = Math.floor(this.count * 0.4);
        for (let i = 0; i < sphereCount; i++) {
            const i3 = i * 3;
            const r = 2.5;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            saturn[i3] = r * Math.sin(phi) * Math.cos(theta);
            saturn[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            saturn[i3 + 2] = r * Math.cos(phi);
        }
        for (let i = sphereCount; i < this.count; i++) {
            const i3 = i * 3;
            const theta = Math.random() * Math.PI * 2;
            const r = 3.5 + Math.random() * 4;

            // X/Z plane ring
            let x = r * Math.cos(theta);
            let y = (Math.random() - 0.5) * 0.2;
            let z = r * Math.sin(theta);

            // Tilt
            const tilt = 0.4;
            const tx = x;
            x = tx * Math.cos(tilt) - y * Math.sin(tilt);
            y = tx * Math.sin(tilt) + y * Math.cos(tilt);

            saturn[i3] = x;
            saturn[i3 + 1] = y;
            saturn[i3 + 2] = z;
        }
        this.templates.saturn = saturn;

        // Initial target
        this.geometry.attributes.aTarget.array.set(random);
    }

    setTarget(templateName) {
        if (this.templates[templateName]) {
            this.currentTarget = templateName;
            this.expanded = false; // Reset expansion on switch
            this.attracted = false; // Reset attraction
        }
    }

    triggerWave() {
        this.isWaving = true;
        this.wavePhase = 0;
        setTimeout(() => { this.isWaving = false; }, 1500);
    }

    setExpanded(state) {
        this.expanded = state;
        if (state) this.attracted = false;
    }

    setAttract(state) {
        this.attracted = state;
        if (state) this.expanded = false;
    }

    update(time, handData) {
        this.material.uniforms.uTime.value = time;

        // update Glow based on API proximity
        let targetGlow = 0;
        if (handData && handData.proximity) {
            targetGlow = handData.proximity; // 0..1
        }
        // Smooth lerp for glow
        this.material.uniforms.uGlow.value += (targetGlow - this.material.uniforms.uGlow.value) * 0.1;

        const positions = this.geometry.attributes.position.array;
        const targetPositions = this.templates[this.currentTarget];
        const colors = this.geometry.attributes.aColor.array;

        // Hand Repel Logic
        let repelPos = null;
        // Attract Target (Hand or Center)
        let attractPos = { x: 0, y: 0, z: 0 };

        if (handData && handData.position) {
            repelPos = handData.position;
            attractPos = handData.position;
        }

        if (this.isWaving) {
            this.wavePhase += 0.1;
        }

        for (let i = 0; i < this.count; i++) {
            const i3 = i * 3;

            let tx = targetPositions[i3];
            let ty = targetPositions[i3 + 1];
            let tz = targetPositions[i3 + 2];

            // Expand behavior (Global)
            if (this.expanded) {
                tx *= 2.0;
                ty *= 2.0;
                tz *= 2.0;
            }

            // Wave behavior (Sine wave moving across X)
            if (this.isWaving) {
                // Wave based on X position
                const waveY = Math.sin(tx * 0.5 + this.wavePhase) * 2.0;
                ty += waveY;
            }

            // Standard Lerp to target
            // Use varying ease for "organic" feel
            const ease = 0.05;
            let cx = positions[i3];
            let cy = positions[i3 + 1];
            let cz = positions[i3 + 2];

            // Attract behavior (Override target)
            if (this.attracted) {
                // Pull towards attractPos
                // We don't want them to all collapse to a single point instantly, but orbit/converge
                tx = attractPos.x + (tx * 0.1); // Collapse structure
                ty = attractPos.y + (ty * 0.1);
                tz = attractPos.z + (tz * 0.1);
            }

            positions[i3] += (tx - cx) * ease;
            positions[i3 + 1] += (ty - cy) * ease;
            positions[i3 + 2] += (tz - cz) * ease;

            // Interaction: Repel (Only if not attracting)
            if (repelPos && !this.attracted) {
                const dx = positions[i3] - repelPos.x;
                const dy = positions[i3 + 1] - repelPos.y;
                const dz = positions[i3 + 2] - repelPos.z;
                const distSq = dx * dx + dy * dy + dz * dz;

                // Radius of influence
                if (distSq < 4.0) {
                    const dist = Math.sqrt(distSq);
                    const force = (2.0 - dist) * 0.15;

                    positions[i3] += dx * force;
                    positions[i3 + 1] += dy * force;
                    positions[i3 + 2] += dz * force;

                    // Temp Color Shift
                    colors[i3] = 1.0;
                } else {
                    // Decay color back to base (simple blue-ish)
                    // base r=0.3, current=positions...
                    if (colors[i3] > 0.5) colors[i3] -= 0.02;
                }
            }
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.aColor.needsUpdate = true;
    }
}
