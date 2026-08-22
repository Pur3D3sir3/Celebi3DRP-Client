import { Canvas } from "@react-three/fiber";
import { useRef } from "react";
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

function PreviewModel({ model }: { model: string }) {
    const { scene } = useGLTF(model);
    const ref = useRef<THREE.Group>(null!);
    const clone = SkeletonUtils.clone(scene);

    useFrame(() => {
        if (ref.current) ref.current.rotation.y += 0.006;
    });

    return (
        <group ref={ref} position={[0, -1.25, 0]} scale={0.9}>
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
            <div className="min-h-screen flex items-center justify-center text-gray-400">
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
        <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-[#0a0a12] via-[#0f0f1a] to-[#120a18]">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent pointer-events-none" />

            <button
                onClick={onLogout}
                className="absolute top-5 right-5 z-50 flex items-center gap-2 px-5 py-3 rounded-xl bg-red-950/60 hover:bg-red-900/80 backdrop-blur-md border border-red-500/50 hover:border-red-400 text-white font-medium shadow-xl transition-all hover:scale-105 active:scale-95"
            >
                <i className="fas fa-sign-out-alt"></i>
                Logout
            </button>

            <button
                onClick={onChangeCharacter}
                className="absolute top-5 left-5 z-50 flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/80 backdrop-blur-md border border-indigo-500/40 hover:border-indigo-400 text-white font-medium shadow-xl transition-all hover:scale-105 active:scale-95"
            >
                <i className="fas fa-users"></i>
                Characters
            </button>

            <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 py-16">
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 mb-2">
                    Velvet Horizon
                </h1>
                <p className="text-gray-400 mb-12 text-lg">Character Lobby</p>

                <div className="w-full max-w-4xl grid md:grid-cols-2 gap-10 items-center">
                    {/* 3D Preview */}
                    <div className="relative aspect-[3/4] max-h-[480px] rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-b from-[#0f0f18] to-[#08080f] shadow-2xl shadow-indigo-500/10">
                        <Canvas camera={{ position: [0, 1.15, 3.6], fov: 38 }} className="!absolute inset-0">
                            <ambientLight intensity={0.55} />
                            <directionalLight position={[4, 8, 5]} intensity={1.6} />
                            <directionalLight position={[-3, 4, -2]} intensity={0.45} />
                            <Environment preset="city" />
                            <PreviewModel model={modelPath} />
                            <ContactShadows position={[0, -1.3, 0]} opacity={0.5} scale={8} blur={2.2} far={3} />
                            <OrbitControls
                                enablePan={false}
                                enableZoom={false}
                                minPolarAngle={Math.PI / 2.5}
                                maxPolarAngle={Math.PI / 1.7}
                                target={[0, 0.35, 0]}
                            />
                        </Canvas>
                        <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-white/5 rounded-3xl" />
                    </div>

                    {/* Info panel */}
                    <div className="flex flex-col gap-6">
                        <div>
                            <p className="text-sm uppercase tracking-widest text-indigo-400/80 mb-1">Playing as</p>
                            <h2 className="text-4xl font-bold text-white">{character.name}</h2>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-end gap-3">
                                <span className="text-5xl font-bold text-indigo-300">{level}</span>
                                <span className="text-gray-400 pb-1.5">Level</span>
                            </div>

                            <div>
                                <div className="flex justify-between text-sm text-gray-400 mb-1.5">
                                    <span>Experience</span>
                                    <span>{exp.toLocaleString()} / {needed.toLocaleString()}</span>
                                </div>
                                <div className="h-3 rounded-full bg-black/50 border border-white/10 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-purple-500 transition-all duration-500"
                                        style={{ width: `${xpPercent}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 space-y-3">
                            <button
                                onClick={onEnterWorld}
                                className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-lg font-semibold shadow-lg shadow-indigo-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                Enter World
                            </button>
                            <p className="text-center text-sm text-gray-500">
                                Continues at your last location
                            </p>
                        </div>
                    </div>
                </div>

                <footer className="mt-16 text-gray-600 text-sm">
                    © 2026 Velvet Horizon • Early Access
                </footer>
            </div>
        </div>
    );
}