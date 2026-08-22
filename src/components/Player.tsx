import React, { useEffect, useState, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import { Billboard, Html } from "@react-three/drei";
import { Character } from "../lib/types";
import { useSocket } from "../lib/constants";

// Tuned for animation match + RuneScape-style feel
const WALK_SPEED = 2.85;
const RUN_SPEED = 5.15;

const UPDATE_INTERVAL = 0.14;
const TRANSITION_DURATION = 0.18;
const IDLE_FALLBACK_WEIGHT = 0.2;
const CATCHUP_MIN_DISTANCE = 0.35;
const RECONCILE_LERP = 0.12;
const MIN_CORRECTION_DIST = 1.1;
const CONTINUOUS_RECONCILE_THRESHOLD = 1.6;
const CONTINUOUS_RECONCILE_ALPHA = 0.04;
const END_PATH_DISABLE_THRESHOLD = 0.92;
const TURN_RATE = 9.5;

type AnimationClips = {
    idle: THREE.AnimationClip | null;
    walkforward: THREE.AnimationClip | null;
    walkstart: THREE.AnimationClip | null;
    stopwalk: THREE.AnimationClip | null;
    pickup: THREE.AnimationClip | null;
    run?: THREE.AnimationClip | null;
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
    runEnabled?: boolean;
    onMovingChange?: (moving: boolean) => void;
};

type AnimState = "idle" | "walkstart" | "walkforward" | "stopwalk" | "pickup" | "run";

function getClosestProgress(curve: THREE.CatmullRomCurve3, point: THREE.Vector3, samples = 48): number {
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i <= samples; i++) {
        const u = i / samples;
        const p = curve.getPointAt(u);
        const d = point.distanceToSquared(p);
        if (d < minDist) {
            minDist = d;
            closest = u;
        }
    }
    return closest;
}

function stripScaleTracks(clip: THREE.AnimationClip | null): THREE.AnimationClip | null {
    if (!clip) return null;
    const filtered = clip.tracks.filter((track) => {
        const name = track.name.toLowerCase();
        return !name.includes("scale");
    });
    if (filtered.length === clip.tracks.length) return clip;
    return new THREE.AnimationClip(clip.name, clip.duration, filtered);
}

function shortestAngleDiff(from: number, to: number): number {
    let diff = to - from;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
}

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
                           runEnabled = false,
                           onMovingChange,
                       }: PlayerProps) {
    const group = useRef<THREE.Group>(null!);
    const rootBoneRef = useRef<THREE.Bone>(null!);
    const lastUpdateRef = useRef(0);
    const { socket, sceneItems } = useSocket();
    const isLocal = character.id === socket.id;

    const currentSpeedRef = useRef(WALK_SPEED);
    currentSpeedRef.current = runEnabled ? RUN_SPEED : WALK_SPEED;

    const hasInitialSnapped = useRef(false);
    const currentYaw = useRef(0);
    const targetYaw = useRef(0);

    const modelUrl = (() => {
        let m = character.model || "/meshy/male1.glb";
        if (!m.startsWith("/")) m = `/meshy/${m}`;
        return m;
    })();

    const { scene } = useGLTF(modelUrl);
    const clone = useMemo(() => {
        const c = SkeletonUtils.clone(scene);
        c.scale.set(1, 1, 1);
        c.updateMatrixWorld(true);
        return c;
    }, [scene]);

    const rootBone = clone.getObjectByName("characters3dcom___Hips") as THREE.Bone;
    if (rootBone) rootBoneRef.current = rootBone;

    const mixer = useMemo(() => new THREE.AnimationMixer(clone), [clone]);

    const actions = useMemo(() => {
        const acts: Partial<Record<AnimState, THREE.AnimationAction | null>> = {};

        const idleClip = stripScaleTracks(clips.idle);
        if (idleClip) {
            const idleAction = mixer.clipAction(idleClip);
            idleAction.setLoop(THREE.LoopRepeat, Infinity);
            acts.idle = idleAction;
        }

        const walkstartClip = stripScaleTracks(clips.walkstart);
        if (walkstartClip) {
            const startAction = mixer.clipAction(walkstartClip);
            startAction.setLoop(THREE.LoopOnce, 1);
            startAction.clampWhenFinished = false;
            acts.walkstart = startAction;
        }

        const walkforwardClip = stripScaleTracks(clips.walkforward);
        if (walkforwardClip) {
            const forwardAction = mixer.clipAction(walkforwardClip);
            forwardAction.setLoop(THREE.LoopRepeat, Infinity);
            forwardAction.clampWhenFinished = false;
            acts.walkforward = forwardAction;
        }

        const stopwalkClip = stripScaleTracks(clips.stopwalk);
        if (stopwalkClip) {
            const stopAction = mixer.clipAction(stopwalkClip);
            stopAction.setLoop(THREE.LoopOnce, 1);
            stopAction.clampWhenFinished = false;
            acts.stopwalk = stopAction;
        }

        const pickupClip = stripScaleTracks(clips.pickup);
        if (pickupClip) {
            const pickupAction = mixer.clipAction(pickupClip);
            pickupAction.setLoop(THREE.LoopOnce, 1);
            pickupAction.clampWhenFinished = false;
            acts.pickup = pickupAction;
        }

        const runClip = stripScaleTracks(clips.run ?? null);
        if (runClip) {
            const runAction = mixer.clipAction(runClip);
            runAction.setLoop(THREE.LoopRepeat, Infinity);
            runAction.clampWhenFinished = false;
            acts.run = runAction;
        }

        return acts as Record<AnimState, THREE.AnimationAction | null>;
    }, [mixer, clips]);

    useEffect(() => {
        // Animation playback rates tuned to the new movement speeds
        if (actions.walkforward) {
            actions.walkforward.timeScale = runEnabled ? 1.75 : 1.12;
        }
        if (actions.walkstart) actions.walkstart.timeScale = 1.1;
        if (actions.stopwalk) actions.stopwalk.timeScale = 1.1;
        if (actions.run) actions.run.timeScale = 1.15;
    }, [actions, runEnabled]);

    const [currentState, setCurrentState] = useState<AnimState>("idle");
    const [isPickupLocked, setIsPickupLocked] = useState(false);
    const prevActionRef = useRef<THREE.AnimationAction | null>(null);

    const lastServerUpdate = useRef(Date.now());
    const targetPosition = useRef(new THREE.Vector3(...character.position));

    const velocity = useRef(new THREE.Vector3());
    const pathCurve = useRef<THREE.CatmullRomCurve3 | null>(null);
    const pathProgress = useRef(0);
    const isInteracting = useRef(false);
    const lastInteractedItemRef = useRef<number | null>(null);

    const remoteIsMovingRef = useRef(false);
    const lastRemoteMoveTimeRef = useRef(0);

    const lastSimTimeRef = useRef(performance.now());
    const backgroundIntervalRef = useRef<number | null>(null);

    const applySmoothTurn = (dt: number) => {
        if (!group.current) return;
        const diff = shortestAngleDiff(currentYaw.current, targetYaw.current);
        if (Math.abs(diff) < 0.001) {
            currentYaw.current = targetYaw.current;
        } else {
            const t = 1 - Math.exp(-TURN_RATE * dt);
            currentYaw.current += diff * t;
        }
        group.current.rotation.y = currentYaw.current;
    };

    const computeStep = (curveLength: number, speed: number, dt: number) => {
        if (curveLength <= 0.0001) return 1;
        const worldStep = speed * dt;
        let step = worldStep / curveLength;
        step = Math.min(step, 0.25);
        return step;
    };

    useEffect(() => {
        if (!isLocal || !group.current) return;
        if (hasInitialSnapped.current) return;

        if (character.position) {
            const [x, y, z] = character.position;
            group.current.position.set(x, y, z);
            if (localPosRef?.current) {
                localPosRef.current.set(x, y, z);
            }
            targetPosition.current.set(x, y, z);
            hasInitialSnapped.current = true;
            currentYaw.current = group.current.rotation.y;
            targetYaw.current = currentYaw.current;
        }
    }, [isLocal, character.position, localPosRef]);

    useEffect(() => {
        if (!isLocal || !localPath || localPath.length < 2 || !group.current) {
            pathCurve.current = null;
            return;
        }

        const points = localPath.map((p) => new THREE.Vector3(...p));
        pathCurve.current = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
        pathProgress.current = getClosestProgress(pathCurve.current, group.current.position);
        lastSimTimeRef.current = performance.now();

        if (points.length >= 2) {
            const dir = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
            if (dir.lengthSq() > 0.0001) {
                targetYaw.current = Math.atan2(dir.x, dir.z);
            }
        }
    }, [localPath, isLocal]);

    useEffect(() => {
        if (currentState === "pickup") {
            setIsPickupLocked(true);
            const timer = setTimeout(() => setIsPickupLocked(false), 2000);
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
            action.time = 0.04;
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
        if (!isLocal) return;
        const isMoving = !!pathCurve.current;
        if (!isMoving) return;

        if (runEnabled) {
            if (actions.run) {
                setCurrentState("run");
            } else {
                setCurrentState("walkforward");
            }
        } else {
            setCurrentState("walkforward");
        }
    }, [runEnabled, isLocal, actions.run]);

    useEffect(() => {
        if (!isLocal && character.position) {
            const [x, y, z] = character.position;
            const curr = targetPosition.current;
            const moved =
                Math.abs(curr.x - x) > 0.001 ||
                Math.abs(curr.y - y) > 0.001 ||
                Math.abs(curr.z - z) > 0.001;

            if (moved) {
                targetPosition.current.set(x, y, z);
                lastServerUpdate.current = Date.now();
            }
        }
    }, [character.position, isLocal]);

    useEffect(() => {
        if (!isLocal) return;

        const handleSceneChange = (data: { scene: number; position?: [number, number, number] }) => {
            if (data.position && group.current) {
                group.current.position.set(...data.position);
                if (localPosRef?.current) localPosRef.current.copy(group.current.position);
                targetPosition.current.set(...data.position);
                pathCurve.current = null;
                pathProgress.current = 0;
                velocity.current.set(0, 0, 0);
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

    useEffect(() => {
        if (!isLocal) return;

        const advancePath = (dtSeconds: number) => {
            if (!pathCurve.current || !group.current) return;

            const speed = currentSpeedRef.current;
            const curveLength = pathCurve.current.getLength();
            if (curveLength <= 0) return;

            const step = computeStep(curveLength, speed, dtSeconds);
            pathProgress.current = Math.min(pathProgress.current + step, 1);

            if (pathProgress.current < 1) {
                const targetPoint = pathCurve.current.getPointAt(pathProgress.current);
                const tangent = pathCurve.current.getTangentAt(pathProgress.current).normalize();

                group.current.position.copy(targetPoint);
                velocity.current.copy(tangent.multiplyScalar(speed));

                if (tangent.lengthSq() > 0.0001) {
                    targetYaw.current = Math.atan2(tangent.x, tangent.z);
                }
                applySmoothTurn(dtSeconds);

                if (localPosRef?.current) {
                    localPosRef.current.copy(group.current.position);
                }

                const now = performance.now() / 1000;
                if (now - lastUpdateRef.current > UPDATE_INTERVAL) {
                    const pos = group.current.position;
                    socket.emit("position_update", [pos.x, pos.y, pos.z], () => {});
                    lastUpdateRef.current = now;
                }
            } else {
                const endPoint = pathCurve.current.getPointAt(1);
                group.current.position.copy(endPoint);
                if (localPosRef?.current) localPosRef.current.copy(endPoint);
                pathCurve.current = null;
                pathProgress.current = 0;
                velocity.current.set(0, 0, 0);
                onNextWaypoint?.();
            }
        };

        const startBackground = () => {
            if (backgroundIntervalRef.current !== null) return;
            lastSimTimeRef.current = performance.now();

            backgroundIntervalRef.current = window.setInterval(() => {
                if (!document.hidden) return;

                const now = performance.now();
                const dt = Math.min((now - lastSimTimeRef.current) / 1000, 0.08);
                lastSimTimeRef.current = now;

                advancePath(dt);
            }, 50);
        };

        const stopBackground = () => {
            if (backgroundIntervalRef.current !== null) {
                clearInterval(backgroundIntervalRef.current);
                backgroundIntervalRef.current = null;
            }
        };

        const onVisibilityChange = () => {
            if (document.hidden) {
                startBackground();
            } else {
                stopBackground();
                if (group.current) {
                    const pos = group.current.position;
                    socket.emit("position_update", [pos.x, pos.y, pos.z], () => {});
                }
            }
        };

        document.addEventListener("visibilitychange", onVisibilityChange);
        if (document.hidden) startBackground();

        return () => {
            stopBackground();
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, [isLocal, socket, onNextWaypoint, localPosRef]);

    useFrame((_, delta) => {
        if (!group.current) return;
        const dt = Math.min(delta, 0.05);
        const pos = group.current.position;
        const speed = currentSpeedRef.current;

        const isCurrentlyMoving = isLocal ? !!pathCurve.current : remoteIsMovingRef.current;
        if (isLocal && onMovingChange) {
            onMovingChange(isCurrentlyMoving);
        }

        if (isLocal && pathCurve.current) {
            const curveLength = pathCurve.current.getLength();
            const step = computeStep(curveLength, speed, dt);
            pathProgress.current = Math.min(pathProgress.current + step, 1);

            if (pathProgress.current < 1) {
                const targetPoint = pathCurve.current.getPointAt(pathProgress.current);
                const tangent = pathCurve.current.getTangentAt(pathProgress.current).normalize();

                pos.copy(targetPoint);
                velocity.current.copy(tangent.multiplyScalar(speed));

                if (tangent.lengthSq() > 0.0001) {
                    targetYaw.current = Math.atan2(tangent.x, tangent.z);
                }
                applySmoothTurn(dt);

                const serverPos = new THREE.Vector3(...character.position);
                const currentDesync = pos.distanceTo(serverPos);

                if (pathProgress.current < END_PATH_DISABLE_THRESHOLD && currentDesync > CONTINUOUS_RECONCILE_THRESHOLD) {
                    pos.lerp(serverPos, CONTINUOUS_RECONCILE_ALPHA);
                    pathProgress.current = getClosestProgress(pathCurve.current, pos);
                }

                const now = performance.now() / 1000;
                if (now - lastUpdateRef.current > UPDATE_INTERVAL) {
                    socket.emit("position_update", [pos.x, pos.y, pos.z], (response: any) => {
                        if (response?.status === "rejected") {
                            const serverPos = new THREE.Vector3(...response.position);
                            const desyncDist = pos.distanceTo(serverPos);
                            if (desyncDist > MIN_CORRECTION_DIST) {
                                pos.lerp(serverPos, RECONCILE_LERP);
                                if (pathCurve.current) {
                                    pathProgress.current = getClosestProgress(pathCurve.current, pos);
                                }
                            }
                            if (localPosRef?.current) localPosRef.current.copy(pos);
                        } else if (response?.status === "error") {
                            pos.set(...character.position);
                            if (localPosRef?.current) localPosRef.current.copy(pos);
                        }
                    });
                    lastUpdateRef.current = now;
                }
            } else {
                const endPoint = pathCurve.current.getPointAt(1);
                pos.copy(endPoint);
                if (localPosRef?.current) localPosRef.current.copy(endPoint);
                pathCurve.current = null;
                pathProgress.current = 0;
                velocity.current.set(0, 0, 0);
                onNextWaypoint?.();

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

                    const faceDir = new THREE.Vector3().subVectors(itemPos, pos).normalize();
                    if (faceDir.lengthSq() > 0.0001) {
                        targetYaw.current = Math.atan2(faceDir.x, faceDir.z);
                    }

                    setTimeout(() => {
                        socket.emit(
                            "interact_item",
                            {
                                instance_id: interactionData.instance_id,
                                type: interactionData.type,
                            },
                            (response: { status: string }) => {
                                isInteracting.current = false;

                                if (response.status === "ok") {
                                    setCurrentState("pickup");
                                } else if (response.status === "too_far") {
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
                            }
                        );
                    }, 50);
                }
            }
        } else if (isLocal) {
            applySmoothTurn(dt);

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

                const faceDir = new THREE.Vector3().subVectors(itemPos, pos).normalize();
                if (faceDir.lengthSq() > 0.0001) {
                    targetYaw.current = Math.atan2(faceDir.x, faceDir.z);
                }

                setTimeout(() => {
                    socket.emit(
                        "interact_item",
                        {
                            instance_id: interactionData.instance_id,
                            type: interactionData.type,
                        },
                        (response: { status: string }) => {
                            isInteracting.current = false;

                            if (response.status === "ok") {
                                setCurrentState("pickup");
                            } else if (response.status === "too_far") {
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
                        }
                    );
                }, 50);
            }

            const serverPos = new THREE.Vector3(...character.position);
            const desyncDist = pos.distanceTo(serverPos);
            if (desyncDist > CATCHUP_MIN_DISTANCE) {
                pos.lerp(serverPos, RECONCILE_LERP);
            }
        }

        if (!isLocal) {
            const lerpFactor = 1 - Math.exp(-14 * dt);
            group.current.position.lerp(targetPosition.current, lerpFactor);

            const dx = targetPosition.current.x - group.current.position.x;
            const dz = targetPosition.current.z - group.current.position.z;
            if (dx * dx + dz * dz > 0.0004) {
                const desired = Math.atan2(dx, dz);
                const diff = shortestAngleDiff(group.current.rotation.y, desired);
                group.current.rotation.y += diff * (1 - Math.exp(-10 * dt));
            }

            const distToTarget = group.current.position.distanceTo(targetPosition.current);
            const timeSinceUpdate = Date.now() - lastServerUpdate.current;

            if (distToTarget > 0.06 || timeSinceUpdate < 260) {
                remoteIsMovingRef.current = true;
                lastRemoteMoveTimeRef.current = Date.now();
            } else if (Date.now() - lastRemoteMoveTimeRef.current > 420) {
                remoteIsMovingRef.current = false;
            }
        }

        if (!isPickupLocked) {
            const isMoving = isLocal ? !!pathCurve.current : remoteIsMovingRef.current;

            if (isMoving) {
                if (runEnabled) {
                    if (actions.run && currentState !== "run") {
                        setCurrentState("run");
                    } else if (!actions.run && currentState !== "walkforward") {
                        setCurrentState("walkforward");
                    }
                } else {
                    if (currentState === "idle" || currentState === "stopwalk" || currentState === "run") {
                        if (actions.walkstart) {
                            setCurrentState("walkstart");
                        } else {
                            setCurrentState("walkforward");
                        }
                    } else if (
                        currentState === "walkstart" &&
                        actions.walkstart &&
                        actions.walkstart.time >= actions.walkstart.getClip().duration * 0.7
                    ) {
                        setCurrentState("walkforward");
                    }
                }
            } else {
                if (currentState === "walkforward" || currentState === "walkstart" || currentState === "run") {
                    if (actions.stopwalk) {
                        setCurrentState("stopwalk");
                    } else {
                        setCurrentState("idle");
                    }
                } else if (
                    currentState === "stopwalk" &&
                    actions.stopwalk &&
                    actions.stopwalk.time >= actions.stopwalk.getClip().duration * 0.7
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

        mixer.update(dt);

        if (group.current) {
            group.current.scale.set(1, 1, 1);
        }
        clone.scale.set(1, 1, 1);
        clone.traverse((obj) => {
            if ((obj as any).isBone) {
                obj.scale.set(1, 1, 1);
            }
        });
        if (rootBoneRef.current) {
            rootBoneRef.current.scale.set(1, 1, 1);
            rootBoneRef.current.position.x = 0;
            rootBoneRef.current.position.z = 0;
        }
        clone.updateMatrixWorld(true);

        if (localPosRef?.current) {
            localPosRef.current.copy(pos);
        }
    });

    return (
        <group ref={group} dispose={null}>
            <primitive object={clone} />
            {speech && (
                <Billboard position={[0, 2.35, 0]} follow={true}>
                    <Html
                        center
                        style={{
                            pointerEvents: "none",
                            userSelect: "none",
                            whiteSpace: "nowrap",
                        }}
                        zIndexRange={[100, 0]}
                    >
                        <div
                            style={{
                                background: "rgba(20, 20, 28, 0.92)",
                                color: "#f0f0f5",
                                padding: "5px 12px",
                                borderRadius: "9999px",
                                fontSize: "13px",
                                fontFamily: "system-ui, -apple-system, sans-serif",
                                fontWeight: 500,
                                border: "1px solid rgba(255,255,255,0.12)",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.45)",
                                lineHeight: 1.3,
                                maxWidth: "260px",
                                textAlign: "center",
                            }}
                        >
                            {speech}
                        </div>
                    </Html>
                </Billboard>
            )}
        </group>
    );
}