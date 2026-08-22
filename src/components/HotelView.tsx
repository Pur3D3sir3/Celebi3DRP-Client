import { Canvas } from "@react-three/fiber";
import { useRef, useEffect, useMemo } from "react";
import { useGLTF, OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";

interface CharacterData {
    id: number;
    name: string;
    model: string;
    current_scene: number;
    last_position: [number, number, number];
    level: number;
    experience: number;
}

interface Props {
    character: CharacterData | null;
    onEnterWorld: () => void;
    onLogout: () => void;
    onChangeCharacter: () => void;
}

useGLTF.preload("/meshy/male1.glb");
useGLTF.preload("/meshy/male2.glb");
useGLTF.preload("/meshy/idle.glb");
useGLTF.preload("/meshy/male2idle.glb");

function stripScaleTracks(clip: THREE.AnimationClip | null): THREE.AnimationClip | null {
    if (!clip) return null;
    const filtered = clip.tracks.filter((track) => {
        const name = track.name.toLowerCase();
        return !name.includes("scale");
    });
    if (filtered.length === clip.tracks.length) return clip;
    return new THREE.AnimationClip(clip.name, clip.duration, filtered);
}

function PreviewModel({ model }: { model: string }) {
    const isMale2 = model.includes("male2");
    const idleUrl = isMale2 ? "/meshy/male2idle.glb" : "/meshy/idle.glb";

    const { scene } = useGLTF(model);
    const { animations: idleAnims } = useGLTF(idleUrl);

    const group = useRef<THREE.Group>(null!);
    const mixerRef = useRef<THREE.AnimationMixer | null>(null);

    const clone = useMemo(() => {
        const c = SkeletonUtils.clone(scene);
        c.scale.set(1, 1, 1);
        c.updateMatrixWorld(true);
        return c;
    }, [scene]);

    useEffect(() => {
        if (!clone) return;

        const mixer = new THREE.AnimationMixer(clone);
        mixerRef.current = mixer;

        let clip: THREE.AnimationClip | null = null;
        if (idleAnims?.length) {
            clip =
                idleAnims.find(
                    (a) =>
                        a.name.toLowerCase().includes("idle") ||
                        a.name.toLowerCase().includes("stand")
                ) || idleAnims[0];
        }

        const cleanClip = stripScaleTracks(clip);
        if (cleanClip) {
            const action = mixer.clipAction(cleanClip);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.play();
            action.setEffectiveWeight(1);
        }

        return () => {
            mixer.stopAllAction();
            mixerRef.current = null;
        };
    }, [clone, idleAnims]);

    useFrame((_, delta) => {
        mixerRef.current?.update(delta);
        if (group.current) {
            group.current.rotation.y += 0.005;
        }
    });

    return (
        <group ref={group} position={[0, -1.1, 0]} scale={0.85}>
            <primitive object={clone} />
        </group>
    );
}

function xpForLevel(level: number) {
    return level * 100;
}

export default function HotelView({ character, onEnterWorld, onLogout, onChangeCharacter }: Props) {
    if (!character) {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center text-gray-400 px-4 bg-gradient-to-br from-[#0a0a12] via-[#0f0f1a] to-[#120a18]">
                Loading character...
            </div>
        );
    }

    const level = character.level || 1;
    const exp = character.experience || 0;
    const needed = xpForLevel(level);
    const xpPercent = Math.min(100, Math.floor((exp / needed) * 100));

    const modelPath = character.model?.startsWith("/")
        ? character.model
        : `/meshy/${character.model || "male1.glb"}`;

    return (
        <div className="min-h-[100dvh] w-full relative bg-gradient-to-br from-[#0a0a12] via-[#0f0f1a] to-[#120a18]">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent pointer-events-none" />

            {/* Top bar – app style */}
            <div className="relative z-20 flex items-center justify-between px-4 py-4 sm:px-6">
                <button
                    onClick={onChangeCharacter}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-950/70 border border-indigo-500/40
                               text-white text-sm font-medium shadow-lg active:scale-95 transition"
                >
                    <i className="fas fa-users"></i>
                    <span className="hidden sm:inline">Characters</span>
                </button>

                <button
                    onClick={onLogout}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-950/70 border border-red-500/50
                               text-white text-sm font-medium shadow-lg active:scale-95 transition"
                >
                    <i className="fas fa-sign-out-alt"></i>
                    <span className="hidden sm:inline">Logout</span>
                </button>
            </div>

            <div className="relative z-10 px-5 pb-10 pt-2 max-w-4xl mx-auto">
                <div className="text-center mb-8">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300">
                        Velvet Horizon
                    </h1>
                    <p className="text-gray-400 mt-1 text-sm">Character Lobby</p>
                </div>

                {/* Mobile: stacked | Desktop: side by side */}
                <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
                    <div className="w-full max-w-[260px] sm:max-w-[300px] shrink-0">
                        <div className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-white/10
                                        bg-gradient-to-b from-[#0f0f18] to-[#08080f] shadow-2xl shadow-indigo-500/10">
                            <Canvas
                                camera={{ position: [0, 1.05, 3.4], fov: 35 }}
                                className="!absolute inset-0"
                                dpr={[1, 1.5]}
                            >
                                <ambientLight intensity={0.55} />
                                <directionalLight position={[4, 8, 5]} intensity={1.5} />
                                <directionalLight position={[-3, 4, -2]} intensity={0.4} />
                                <Environment preset="city" />
                                <PreviewModel model={modelPath} />
                                <ContactShadows position={[0, -1.2, 0]} opacity={0.5} scale={7} blur={2} far={3} />
                                <OrbitControls
                                    enablePan={false}
                                    enableZoom={false}
                                    minPolarAngle={Math.PI / 2.5}
                                    maxPolarAngle={Math.PI / 1.7}
                                    target={[0, 0.28, 0]}
                                />
                            </Canvas>
                            <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-white/5 rounded-2xl" />
                        </div>
                    </div>

                    <div className="flex-1 w-full text-center md:text-left">
                        <div className="mb-5">
                            <p className="text-xs uppercase tracking-widest text-indigo-400/80 mb-1">Playing as</p>
                            <h2 className="text-2xl sm:text-3xl font-bold text-white truncate">{character.name}</h2>
                        </div>

                        <div className="mb-6 space-y-3">
                            <div className="flex items-end justify-center md:justify-start gap-2.5">
                                <span className="text-4xl sm:text-5xl font-bold text-indigo-300">{level}</span>
                                <span className="text-gray-400 pb-1.5 text-sm">Level</span>
                            </div>

                            <div className="max-w-[240px] mx-auto md:mx-0">
                                <div className="flex justify-between text-sm text-gray-400 mb-1.5">
                                    <span>Experience</span>
                                    <span>
                                        {exp.toLocaleString()} / {needed.toLocaleString()}
                                    </span>
                                </div>
                                <div className="h-2.5 rounded-full bg-black/50 border border-white/10 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-purple-500 transition-all duration-500"
                                        style={{ width: `${xpPercent}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={onEnterWorld}
                            className="w-full md:w-auto md:min-w-[200px] py-3.5 px-8 rounded-xl
                                       bg-gradient-to-r from-indigo-600 to-indigo-500 text-white text-base font-semibold
                                       shadow-lg shadow-indigo-500/30 active:scale-[0.98] transition"
                        >
                            Enter World
                        </button>
                        <p className="mt-2 text-sm text-gray-500">Continues at your last location</p>
                    </div>
                </div>

                <footer className="mt-12 text-center text-gray-600 text-sm">
                    © 2026 Velvet Horizon • Early Access
                </footer>
            </div>
        </div>
    );
}