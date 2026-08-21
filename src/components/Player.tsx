import React, { useEffect, useState, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import { Billboard, Html } from "@react-three/drei";
import { Character } from "../lib/types";
import { useSocket } from "../lib/constants";

const BASE_SPEED = 3.6;                    // Increased from 2.0 — matches RuneScape normal walk feel
// const BASE_SPEED = 3.2;                 // slightly slower / more classic
// const BASE_SPEED = 4.0;                 // brisker pace

// Later when run toggle is wired:
// const effectiveSpeed = runEnabled ? 5.8 : BASE_SPEED;
// const walkTimeScale = runEnabled ? 2.4 : 1.8;

const STOP_THRESHOLD = 0.08;
const UPDATE_INTERVAL = 0.2;
const TRANSITION_DURATION = 0.4;
const IDLE_FALLBACK_WEIGHT = 0.3;
const CATCHUP_MIN_DISTANCE = 0.2;
const RECONCILE_LERP = 0.15;
const MIN_CORRECTION_DIST = 0.8;
const CONTINUOUS_RECONCILE_THRESHOLD = 0.5;
const CONTINUOUS_RECONCILE_ALPHA = 0.06;
const END_PATH_DISABLE_THRESHOLD = 0.85;

type AnimationClips = {
    idle: THREE.AnimationClip;
    walkforward: THREE.AnimationClip;
    walkstart: THREE.AnimationClip;
    stopwalk: THREE.AnimationClip;
    pickup: THREE.AnimationClip;
};

type PlayerProps = {
    character: Character;
    clips: AnimationClips;
    localPath?: [number, number, number][];
    onNextWaypoint?: () => void;
    localPosRef?: React.RefObject<THREE.Vector3>;
    pendingInteraction?: { type: string; instance_id: number; position: [number, number, number] } | null;
    setPendingInteraction?: (p: null) => void;
    maxInteractDist?: number;
    speech?: string;
    onSpeech?: (text: string) => void;
};

type AnimState = "idle" | "walkstart" | "walkforward" | "stopwalk" | "pickup";

export function Player({
                           character,
                           clips,
                           localPath,
                           onNextWaypoint,
                           localPosRef,
                           pendingInteraction,
                           setPendingInteraction,
                           maxInteractDist,
                           speech,
                           onSpeech,
                       }: PlayerProps) {
    const group = useRef<THREE.Group>(null!);
    const rootBoneRef = useRef<THREE.Bone>(null!);
    const lastUpdateRef = useRef(0);
    const { socket, sceneItems } = useSocket();
    const isLocal = character.id === socket.id;

    const { scene } = useGLTF(`${character.model}`);
    const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);

    const rootBone = clone.getObjectByName("characters3dcom___Hips") as THREE.Bone;
    if (rootBone) rootBoneRef.current = rootBone;

    const mixer = useMemo(() => new THREE.AnimationMixer(clone), [clone]);

    const actions = useMemo(() => {
        const acts: Partial<Record<AnimState, THREE.AnimationAction | null>> = {};

        if (clips.idle) {
            const idleAction = mixer.clipAction(clips.idle);
            idleAction.setLoop(THREE.LoopRepeat, Infinity);
            acts.idle = idleAction;
        }

        if (clips.walkstart) {
            const startAction = mixer.clipAction(clips.walkstart);
            startAction.setLoop(THREE.LoopOnce, 1);
            startAction.clampWhenFinished = false;
            acts.walkstart = startAction;
        }

        if (clips.walkforward) {
            const forwardAction = mixer.clipAction(clips.walkforward);
            forwardAction.setLoop(THREE.LoopRepeat, Infinity);
            forwardAction.clampWhenFinished = false;
            acts.walkforward = forwardAction;
        }

        if (clips.stopwalk) {
            const stopAction = mixer.clipAction(clips.stopwalk);
            stopAction.setLoop(THREE.LoopOnce, 1);
            stopAction.clampWhenFinished = false;
            acts.stopwalk = stopAction;
        }

        if (clips.pickup) {
            const pickupAction = mixer.clipAction(clips.pickup);
            pickupAction.setLoop(THREE.LoopOnce, 1);
            pickupAction.clampWhenFinished = false;
            acts.pickup = pickupAction;
        }

        return acts as Record<AnimState, THREE.AnimationAction | null>;
    }, [mixer, clips]);

    // Speed up walk animations to match faster ground movement (prevents sliding feet)
    useEffect(() => {
        if (actions.walkforward) {
            actions.walkforward.timeScale = 1.8;   // 1.7–1.9 usually looks best with BASE_SPEED 3.6
        }
        if (actions.walkstart) {
            actions.walkstart.timeScale = 1.5;
        }
        if (actions.stopwalk) {
            actions.stopwalk.timeScale = 1.5;
        }
    }, [actions]);

    const [currentState, setCurrentState] = useState<AnimState>("idle");
    const [isPickupLocked, setIsPickupLocked] = useState(false);
    const prevActionRef = useRef<THREE.AnimationAction | null>(null);

    const [previousPosition, setPreviousPosition] = useState(character.position);
    const lastServerUpdate = useRef(Date.now());

    const velocity = useRef(new THREE.Vector3());
    const pathCurve = useRef<THREE.CatmullRomCurve3 | null>(null);
    const pathProgress = useRef(0);
    const isInteracting = useRef(false);
    const lastInteractedItemRef = useRef<number | null>(null);

    useEffect(() => {
        if (isLocal && localPath && localPath.length > 1) {
            const points = localPath.map(p => new THREE.Vector3(...p));
            pathCurve.current = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
            pathProgress.current = 0;
        } else {
            pathCurve.current = null;
        }
    }, [localPath, isLocal]);

    useEffect(() => {
        if (currentState === "pickup") {
            setIsPickupLocked(true);
            const timer = setTimeout(() => {
                setIsPickupLocked(false);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [currentState]);

    useEffect(() => {
        if (actions.idle) {
            actions.idle.reset().play();
            actions.idle.setEffectiveWeight(1.0);
            actions.idle.time = Math.random() * (clips.idle?.duration || 0);
        }
        if (actions.walkstart) {
            actions.walkstart.play();
            actions.walkstart.setEffectiveWeight(0.0);
        }
    }, [actions, clips.idle?.duration]);

    useEffect(() => {
        const action = actions[currentState];
        if (!action) return;

        const prev = prevActionRef.current;

        if (actions.idle && currentState !== "idle") {
            actions.idle.setEffectiveWeight(IDLE_FALLBACK_WEIGHT);
            if (!actions.idle.isRunning()) actions.idle.play();
        } else if (actions.idle) {
            actions.idle.setEffectiveWeight(1.0);
        }

        if (prev && prev !== action) {
            action.reset();
            action.time = 0.1;
            action.crossFadeFrom(prev, TRANSITION_DURATION, true);
        } else {
            action.fadeIn(TRANSITION_DURATION);
        }

        action.setEffectiveWeight(1.0);
        action.play();

        prevActionRef.current = action;

        return () => {
            if (action) action.fadeOut(TRANSITION_DURATION);
        };
    }, [currentState, actions]);

    useEffect(() => {
        if (group.current && character.position) {
            if (!isLocal) {
                setPreviousPosition([...group.current.position]);
            }
            group.current.position.set(...character.position);
            lastServerUpdate.current = Date.now();

            if (localPosRef?.current) {
                localPosRef.current.copy(group.current.position);
            }
        }
    }, [character.position, isLocal, localPosRef]);

    useEffect(() => {
        if (!isLocal) return;

        const handleSceneChange = (data: { scene: number; position?: [number, number, number] }) => {
            if (data.position && group.current) {
                group.current.position.set(...data.position);
                if (localPosRef?.current) {
                    localPosRef.current.copy(group.current.position);
                }
                setCurrentState("idle");
                if (actions.idle) {
                    actions.idle.reset().play();
                    actions.idle.time = 0;
                    actions.idle.setEffectiveWeight(1.0);
                }
                Object.values(actions).forEach((action) => {
                    if (action && action !== actions.idle) {
                        action.stop();
                        action.setEffectiveWeight(0);
                    }
                });
            }
        };

        socket.on("scene_change", handleSceneChange);
        return () => socket.off("scene_change", handleSceneChange);
    }, [isLocal, socket, actions, localPosRef]);

    useFrame((_, delta) => {
        if (!group.current) return;
        const pos = group.current.position;

        if (isLocal && pathCurve.current) {
            const curveLength = pathCurve.current.getLength();
            let step = BASE_SPEED * delta / curveLength;
            step = Math.min(step, 0.01);

            pathProgress.current = Math.min(pathProgress.current + step, 1);

            if (pathProgress.current < 1) {
                const targetPoint = pathCurve.current.getPointAt(pathProgress.current);
                const tangent = pathCurve.current.getTangentAt(pathProgress.current).normalize();

                pos.copy(targetPoint);
                velocity.current.copy(tangent.multiplyScalar(BASE_SPEED));
                group.current.lookAt(pos.clone().add(tangent));

                const serverPos = new THREE.Vector3(...character.position);
                const currentDesync = pos.distanceTo(serverPos);

                if (pathProgress.current < END_PATH_DISABLE_THRESHOLD && currentDesync > CONTINUOUS_RECONCILE_THRESHOLD) {
                    pos.lerp(serverPos, CONTINUOUS_RECONCILE_ALPHA);
                } else if (currentDesync > 1.2) {
                    pos.lerp(serverPos, 0.12);
                }

                const now = performance.now() / 1000;
                if (now - lastUpdateRef.current > UPDATE_INTERVAL) {
                    socket.emit("position_update", [pos.x, pos.y, pos.z], (response: any) => {
                        if (response?.status === 'rejected') {
                            const serverPos = new THREE.Vector3(...response.position);
                            const desyncDist = pos.distanceTo(serverPos);
                            if (desyncDist > MIN_CORRECTION_DIST) {
                                pos.lerp(serverPos, RECONCILE_LERP);
                                pathProgress.current = Math.max(0, pathProgress.current - step * 1.2);
                            }
                            if (localPosRef?.current) localPosRef.current.copy(pos);
                        } else if (response?.status === 'error') {
                            pos.set(...character.position);
                            if (localPosRef?.current) localPosRef.current.copy(pos);
                        }
                    });
                    lastUpdateRef.current = now;
                }
            } else {
                pathCurve.current = null;
                pathProgress.current = 0;
                velocity.current.set(0, 0, 0);
                onNextWaypoint?.();

                // Interaction trigger when path completes
                if (pendingInteraction && setPendingInteraction && maxInteractDist) {
                    if (isInteracting.current) return;
                    if (lastInteractedItemRef.current === pendingInteraction.instance_id) {
                        setPendingInteraction(null);
                        return;
                    }

                    const item = sceneItems.find((i) => i.instance_id === pendingInteraction.instance_id);
                    if (!item) {
                        setPendingInteraction(null);
                        return;
                    }

                    const itemPos = new THREE.Vector3(item.pos_x, item.pos_y || 0, item.pos_z);
                    const dist = pos.distanceTo(itemPos);

                    if (dist > maxInteractDist + 0.1) {
                        onSpeech?.("I'm too far away!");
                        setPendingInteraction(null);
                        return;
                    }

                    isInteracting.current = true;
                    lastInteractedItemRef.current = pendingInteraction.instance_id;

                    const interactionData = { ...pendingInteraction };
                    setPendingInteraction(null);

                    setCurrentState("idle");

                    setTimeout(() => {
                        socket.emit("interact_item", {
                            instance_id: interactionData.instance_id,
                            type: interactionData.type,
                        }, (response: { status: string }) => {
                            isInteracting.current = false;

                            if (response.status === 'ok') {
                                setCurrentState("pickup");
                                group.current.lookAt(itemPos);
                            } else if (response.status === 'too_far') {
                                onSpeech?.("I'm too far away!");
                                setCurrentState("idle");
                            } else {
                                onSpeech?.("Couldn't pick up the item.");
                                setCurrentState("idle");
                            }

                            setTimeout(() => {
                                if (lastInteractedItemRef.current === interactionData.instance_id) {
                                    lastInteractedItemRef.current = null;
                                }
                            }, 1200);
                        });
                    }, 50);
                }
            }
        } else if (isLocal) {
            // Interaction trigger when already close (no path)
            if (pendingInteraction && setPendingInteraction && maxInteractDist) {
                if (isInteracting.current) return;
                if (lastInteractedItemRef.current === pendingInteraction.instance_id) {
                    setPendingInteraction(null);
                    return;
                }

                const item = sceneItems.find((i) => i.instance_id === pendingInteraction.instance_id);
                if (!item) {
                    setPendingInteraction(null);
                    return;
                }

                const itemPos = new THREE.Vector3(item.pos_x, item.pos_y || 0, item.pos_z);
                const dist = pos.distanceTo(itemPos);

                if (dist > maxInteractDist + 0.1) {
                    onSpeech?.("I'm too far away!");
                    setPendingInteraction(null);
                    return;
                }

                isInteracting.current = true;
                lastInteractedItemRef.current = pendingInteraction.instance_id;

                const interactionData = { ...pendingInteraction };
                setPendingInteraction(null);

                setCurrentState("idle");

                setTimeout(() => {
                    socket.emit("interact_item", {
                        instance_id: interactionData.instance_id,
                        type: interactionData.type,
                    }, (response: { status: string }) => {
                        isInteracting.current = false;

                        if (response.status === 'ok') {
                            setCurrentState("pickup");
                            group.current.lookAt(itemPos);
                        } else if (response.status === 'too_far') {
                            onSpeech?.("I'm too far away!");
                            setCurrentState("idle");
                        } else {
                            onSpeech?.("Couldn't pick up the item.");
                            setCurrentState("idle");
                        }

                        setTimeout(() => {
                            if (lastInteractedItemRef.current === interactionData.instance_id) {
                                lastInteractedItemRef.current = null;
                            }
                        }, 1200);
                    });
                }, 50);
            }

            const serverPos = new THREE.Vector3(...character.position);
            const desyncDist = pos.distanceTo(serverPos);
            if (desyncDist > CATCHUP_MIN_DISTANCE) {
                pos.lerp(serverPos, RECONCILE_LERP);
            }
        }

        if (!isLocal) {
            const timeSinceUpdate = (Date.now() - lastServerUpdate.current) / 1000;
            const alpha = Math.min(timeSinceUpdate / 0.1, 1.0);
            const interpolatedPos = new THREE.Vector3().lerpVectors(
                new THREE.Vector3(...previousPosition),
                new THREE.Vector3(...character.position),
                alpha
            );
            group.current.position.lerp(interpolatedPos, 0.1);

            if (previousPosition[0] !== character.position[0] || previousPosition[2] !== character.position[2]) {
                group.current.lookAt(new THREE.Vector3(...character.position));
            }
        }

        if (!isPickupLocked) {
            const isMoving = isLocal
                ? !!pathCurve.current
                : (previousPosition[0] !== character.position[0] || previousPosition[2] !== character.position[2]);

            if (isMoving) {
                if (currentState === "idle" || currentState === "stopwalk") {
                    setCurrentState("walkstart");
                } else if (
                    currentState === "walkstart" &&
                    actions.walkstart &&
                    actions.walkstart.time >= actions.walkstart.getClip().duration * 0.75
                ) {
                    setCurrentState("walkforward");
                }
            } else {
                if (currentState === "walkforward" || currentState === "walkstart") {
                    setCurrentState("stopwalk");
                } else if (
                    currentState === "stopwalk" &&
                    actions.stopwalk &&
                    actions.stopwalk.time >= actions.stopwalk.getClip().duration * 0.75
                ) {
                    setCurrentState("idle");
                }
            }
        }

        if (
            currentState === "pickup" &&
            actions.pickup &&
            actions.pickup.time >= actions.pickup.getClip().duration - 0.15
        ) {
            setCurrentState("idle");
            setIsPickupLocked(false);
        }

        mixer.update(delta);

        if (rootBoneRef.current) {
            rootBoneRef.current.position.x = 0;
            rootBoneRef.current.position.z = 0;
        }

        if (localPosRef?.current) {
            localPosRef.current.copy(pos);
        }
    });

    useEffect(() => {
        clone.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                const originalMat = child.material;
                if (originalMat instanceof THREE.MeshStandardMaterial) {
                    const newMat = originalMat.clone();
                    if (!originalMat.map) {
                        newMat.color.set(character.dogColor);
                    } else {
                        newMat.color.multiply(new THREE.Color(character.dogColor).multiplyScalar(0.3));
                        newMat.color.addScalar(0.7);
                    }
                    child.material = newMat;
                }
            }
        });
    }, [clone, character.dogColor]);

    return (
        <group ref={group} dispose={null}>
            <primitive object={clone} />
            {speech && (
                <Billboard position={[0, 2.5, 0]} follow={true} lockX={false} lockY={false} lockZ={false}>
                    <Html center distanceFactor={10} transform occlude="blending" zIndexRange={[100, 0]}>
                        <div className="bg-gray-800/90 text-white px-3 py-1.5 rounded-full text-sm shadow-md border border-gray-700/50 whitespace-nowrap">
                            {speech}
                        </div>
                    </Html>
                </Billboard>
            )}
        </group>
    );
}