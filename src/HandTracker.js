import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

export class HandTracker {
    constructor() {
        this.results = null;
        this.videoElement = document.querySelector('input_video');

        // Settings for robust tracking
        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.6, // Higher confidence for cleaner gestures
            minTrackingConfidence: 0.6
        });

        this.hands.onResults(this.onResults.bind(this));

        // Swipe Detection State
        this.lastPalmX = null;
        this.swipeDirection = null;
        this.swipeFrames = 0;
    }

    start() {
        if (!this.videoElement) {
            this.updateStatus("Error: Video element not found.");
            return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.updateStatus("Error: Camera API not available. Check browser permissions.");
            return;
        }

        const camera = new Camera(this.videoElement, {
            onFrame: async () => {
                await this.hands.send({ image: this.videoElement });
            },
            width: 640,
            height: 480
        });

        camera.start()
            .then(() => {
                this.updateStatus("Camera active. Wave your hand!");
            })
            .catch(err => {
                console.error("Camera error:", err);
                this.updateStatus("Camera Error:" + err.message || 'Permission denied');
            });
    }

    updateStatus(msg) {
        const statusEl = document.querySelector('.status');
        if (statusEl) statusEl.textContent = msg;
    }

    onResults(results) {
        this.results = results;
    }

    getData() {
        if (!this.results || !this.results.multiHandLandmarks || this.results.multiHandLandmarks.length === 0) {
            this.lastPalmX = null;
            return null;
        }

        const landmarks = this.results.multiHandLandmarks[0];

        // 1. Basic Coordinates (Normalized)
        // MediaPipe: x increases right, y increases down
        // 3D World (Three.js): x increases right, y increases UP.
        // We map and invert Y.

        // Use Index Finger Tip (8) as cursor
        const indexTip = landmarks[8];
        const thumbTip = landmarks[4];
        const wrist = landmarks[0];

        // Map 0..1 to -1..1 logic
        const x = (indexTip.x - 0.5) * 2;
        const y = (0.5 - indexTip.y) * 2;

        // Proximity (z-estimation)
        // Measure distance between Wrist (0) and Middle finger MCP (9)
        // When hand is close, this distance appears larger in 2D
        const middleMcp = landmarks[9];
        const dx = wrist.x - middleMcp.x;
        const dy = wrist.y - middleMcp.y;
        const palmSize = Math.sqrt(dx * dx + dy * dy);
        // Heuristic: palmSize ~0.15 is "far", ~0.3 is "close"
        // Normalize 0..1 broadly
        const proximity = Math.min(Math.max((palmSize - 0.1) * 3.0, 0), 1);

        // 2. Gesture Recognition
        const gesture = this.detectGesture(landmarks);

        // 3. Swipe Detection
        // Use Wrist or Palm center x
        const palmX = landmarks[9].x;
        let swipe = 'none';

        if (this.lastPalmX !== null) {
            const diff = palmX - this.lastPalmX;
            // Threshold for movement
            if (Math.abs(diff) > 0.03) {
                // If consistent direction for a few frames?
                // Simple version: instantaneous velocity
                if (diff > 0) swipe = 'left'; // MP: x increases right, but camera is mirrored usually. Let's assume standard.
                else swipe = 'right';
            }
        }
        this.lastPalmX = palmX;

        return {
            position: { x, y, z: 0 },
            proximity: proximity,
            gesture: gesture,
            swipe: swipe,
            raw: landmarks
        };
    }

    detectGesture(landmarks) {
        // Simple and robust finger states
        // Tip (4, 8, 12, 16, 20) vs PIP (2, 6, 10, 14, 18) or MCP
        const isFingerTipsUp = (tipIdx, pipIdx) => {
            // Y increases downwards in MP
            // Finger UP means Tip Y < Pip Y
            return landmarks[tipIdx].y < landmarks[pipIdx].y;
        };

        // Or better: Distance from wrist. Extended finger tip is further from wrist than PIP.
        const distSq = (p1, p2) => Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);

        const isExtended = (tipIdx, pipIdx, mcpIdx) => {
            const wrist = landmarks[0];
            return distSq(landmarks[tipIdx], wrist) > distSq(landmarks[pipIdx], wrist);
        };

        const thumbOpen = isExtended(4, 3, 2);
        const indexOpen = isExtended(8, 6, 5);
        const middleOpen = isExtended(12, 10, 9);
        const ringOpen = isExtended(16, 14, 13);
        const pinkyOpen = isExtended(20, 18, 17);

        const openCount = [indexOpen, middleOpen, ringOpen, pinkyOpen].filter(Boolean).length;

        // Thumb Pinch Check
        const pinchDist = Math.sqrt(distSq(landmarks[4], landmarks[8]));
        const isPinch = pinchDist < 0.05;

        // Classification
        if (isPinch) return 'pinch';
        if (openCount === 4) return 'open'; // All main fingers open
        if (openCount === 0) return 'fist'; // All main fingers closed

        return 'neutral';
    }
}
