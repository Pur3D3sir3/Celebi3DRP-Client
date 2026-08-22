import { Canvas } from "@react-three/fiber";
import { useRef, useState, useEffect, useMemo } from "react";
import { useGLTF, OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import axios from "axios";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";

interface Props {
    token: string;
    onSelect: () => void;
    onLogout: () => void;
}

const availableModels = [
    { id: "male1", name: "Male Agent", model: "/meshy/male1.glb", desc: "Stealth & precision" },
    { id: "male2", name: "Male Enforcer", model: "/meshy/male2.glb", desc: "Heavy firepower" },
];

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
            group.current.rotation.y += 0.006;
        }
    });

    return (
        <group ref={group} position={[0, -1.05, 0]} scale={0.78}>
            <primitive object={clone} />
        </group>
    );
}

export default function CharacterSelect({ token, onSelect, onLogout }: Props) {
    const [characters, setCharacters] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [selectedModel, setSelectedModel] = useState("/meshy/male1.glb");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const carouselRef = useRef<HTMLDivElement>(null);

    const loadCharacters = async () => {
        try {
            const res = await axios.get("/characters", {
                headers: { Authorization: `Bearer ${token}` },
            });
            setCharacters(res.data.characters || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCharacters();
    }, [token]);

    const handlePlay = async (characterId: number) => {
        setBusy(true);
        try {
            await axios.post(
                "/select-character",
                { character_id: characterId },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            onSelect();
        } catch (err: any) {
            setError(err.response?.data?.error || "Failed to select character");
        } finally {
            setBusy(false);
        }
    };

    const handleCreate = async () => {
        if (!newName.trim()) {
            setError("Enter a character name");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const res = await axios.post(
                "/characters",
                { name: newName.trim(), model: selectedModel },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            await axios.post(
                "/select-character",
                { character_id: res.data.character.id },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            onSelect();
        } catch (err: any) {
            setError(err.response?.data?.error || "Failed to create character");
            setBusy(false);
        }
    };

    // Build slots: existing characters + one create slot (if under 3)
    const slots: Array<{ type: "char"; data: any } | { type: "create" }> = [];
    characters.forEach((c) => slots.push({ type: "char", data: c }));
    if (characters.length < 3) {
        slots.push({ type: "create" });
    }

    const scrollToIndex = (index: number) => {
        const el = carouselRef.current;
        if (!el) return;
        const card = el.children[index] as HTMLElement;
        if (card) {
            card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
            setActiveIndex(index);
        }
    };

    const onCarouselScroll = () => {
        const el = carouselRef.current;
        if (!el) return;
        const center = el.scrollLeft + el.clientWidth / 2;
        let closest = 0;
        let minDist = Infinity;
        Array.from(el.children).forEach((child, i) => {
            const c = child as HTMLElement;
            const mid = c.offsetLeft + c.offsetWidth / 2;
            const dist = Math.abs(center - mid);
            if (dist < minDist) {
                minDist = dist;
                closest = i;
            }
        });
        setActiveIndex(closest);
    };

    if (loading) {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center text-gray-400 px-4 bg-gradient-to-b from-[#0f0f11] to-[#0a0a0f]">
                Loading characters...
            </div>
        );
    }

    // ── Create Character ──
    if (creating) {
        return (
            <div className="min-h-[100dvh] w-full bg-gradient-to-b from-[#0f0f11] to-[#0a0a0f]">
                <div className="flex items-center justify-between px-4 py-4 sm:px-6">
                    <button
                        onClick={() => {
                            setCreating(false);
                            setError("");
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-950/70 border border-indigo-500/40
                                   text-white text-sm font-medium shadow-lg active:scale-95 transition"
                    >
                        <i className="fas fa-arrow-left"></i>
                        <span>Back</span>
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

                <div className="px-5 pb-10 max-w-md mx-auto">
                    <div className="text-center mb-8">
                        <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-400">
                            Create Character
                        </h1>
                        <p className="mt-2 text-sm text-gray-400">Choose a name and appearance</p>
                    </div>

                    <div className="mb-5">
                        <label className="block text-sm font-medium text-gray-300 mb-2">Character Name</label>
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            maxLength={32}
                            placeholder="Enter name..."
                            className="w-full px-4 py-3.5 bg-black/50 border border-white/10 rounded-xl text-white
                                       focus:outline-none focus:border-indigo-500/50 text-base"
                        />
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-300 mb-3">Appearance</label>
                        <div className="grid grid-cols-2 gap-3">
                            {availableModels.map((m) => (
                                <button
                                    key={m.id}
                                    onClick={() => setSelectedModel(m.model)}
                                    className={`relative flex flex-col overflow-hidden rounded-2xl border-2 transition-all
                                        ${selectedModel === m.model
                                        ? "border-indigo-500 shadow-lg shadow-indigo-500/25"
                                        : "border-white/10"}`}
                                >
                                    <div className="h-44 sm:h-48 bg-gradient-to-b from-[#0f0f18] to-[#08080f] relative">
                                        <Canvas
                                            camera={{ position: [0, 1.0, 3.35], fov: 34 }}
                                            className="!absolute inset-0"
                                            dpr={[1, 1.5]}
                                        >
                                            <ambientLight intensity={0.55} />
                                            <directionalLight position={[4, 8, 5]} intensity={1.5} />
                                            <Environment preset="city" />
                                            <PreviewModel model={m.model} />
                                            <ContactShadows position={[0, -1.25, 0]} opacity={0.45} scale={6} blur={2} far={3} />
                                        </Canvas>
                                    </div>
                                    <div className="p-3 text-left bg-black/40">
                                        <div className="font-semibold text-sm">{m.name}</div>
                                        <div className="text-xs text-gray-400 mt-0.5">{m.desc}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <p className="mb-4 text-red-400 text-center bg-red-950/30 py-2.5 rounded-xl text-sm">{error}</p>
                    )}

                    <button
                        onClick={handleCreate}
                        disabled={busy}
                        className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-semibold rounded-xl
                                   shadow-lg shadow-indigo-500/25 disabled:opacity-50 text-base active:scale-[0.98] transition"
                    >
                        {busy ? "Creating..." : "Create & Play"}
                    </button>
                </div>
            </div>
        );
    }

    // ── Character Select – horizontal carousel (mobile app style) ──
    return (
        <div className="min-h-[100dvh] w-full flex flex-col bg-gradient-to-b from-[#0f0f11] to-[#0a0a0f]">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-4 sm:px-6">
                <div className="w-10" />
                <div className="text-center">
                    <h1 className="text-xl sm:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-400">
                        Select Character
                    </h1>
                    <p className="text-xs text-gray-500 mt-0.5">Swipe to browse</p>
                </div>
                <button
                    onClick={onLogout}
                    className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-950/70 border border-red-500/50
                               text-white shadow-lg active:scale-95 transition"
                >
                    <i className="fas fa-sign-out-alt"></i>
                </button>
            </div>

            {error && (
                <p className="mx-4 mb-2 text-red-400 bg-red-950/30 px-4 py-2 rounded-xl text-sm text-center">{error}</p>
            )}

            {/* Carousel */}
            <div className="flex-1 flex flex-col justify-center min-h-0">
                <div
                    ref={carouselRef}
                    onScroll={onCarouselScroll}
                    className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-[calc(50%-140px)] sm:px-[calc(50%-150px)] pb-2
                               scrollbar-hide"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                    {slots.map((slot, index) => {
                        if (slot.type === "char") {
                            const char = slot.data;
                            return (
                                <div
                                    key={char.id}
                                    className="snap-center shrink-0 w-[280px] sm:w-[300px] flex flex-col
                                               backdrop-blur-xl bg-black/40 border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
                                >
                                    <div className="h-56 sm:h-64 relative bg-gradient-to-b from-[#0f0f18] to-[#08080f]">
                                        <Canvas
                                            camera={{ position: [0, 1.0, 3.35], fov: 34 }}
                                            className="!absolute inset-0"
                                            dpr={[1, 1.5]}
                                        >
                                            <ambientLight intensity={0.55} />
                                            <directionalLight position={[4, 8, 5]} intensity={1.5} />
                                            <Environment preset="city" />
                                            <PreviewModel model={char.model} />
                                            <ContactShadows position={[0, -1.25, 0]} opacity={0.45} scale={6} blur={2} far={3} />
                                            <OrbitControls
                                                enablePan={false}
                                                enableZoom={false}
                                                minPolarAngle={Math.PI / 2.4}
                                                maxPolarAngle={Math.PI / 1.7}
                                                target={[0, 0.3, 0]}
                                            />
                                        </Canvas>
                                    </div>
                                    <div className="p-4">
                                        <h3 className="text-lg font-semibold truncate text-center">{char.name}</h3>
                                        <p className="text-xs text-gray-400 text-center mt-0.5">
                                            {char.model.includes("male2") ? "Male Enforcer" : "Male Agent"}
                                        </p>
                                        <button
                                            onClick={() => handlePlay(char.id)}
                                            disabled={busy}
                                            className="mt-4 w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-semibold rounded-xl
                                                       shadow-lg shadow-indigo-500/25 disabled:opacity-50 text-sm active:scale-[0.98] transition"
                                        >
                                            Play
                                        </button>
                                    </div>
                                </div>
                            );
                        }

                        // Create slot
                        return (
                            <button
                                key="create-slot"
                                onClick={() => setCreating(true)}
                                className="snap-center shrink-0 w-[280px] sm:w-[300px] flex flex-col items-center justify-center
                                           min-h-[360px] backdrop-blur-xl bg-black/20 border-2 border-dashed border-white/20 rounded-2xl
                                           hover:border-indigo-500/50 hover:bg-indigo-950/20 transition-all"
                            >
                                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                                    <i className="fas fa-plus text-2xl text-gray-400"></i>
                                </div>
                                <span className="text-base font-medium text-gray-300">Add Character</span>
                                <span className="mt-1 text-xs text-gray-500">
                                    {characters.length}/3 slots used
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Dots + arrows */}
                <div className="flex items-center justify-center gap-4 mt-5 mb-6">
                    <button
                        onClick={() => scrollToIndex(Math.max(0, activeIndex - 1))}
                        disabled={activeIndex === 0}
                        className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center
                                   text-gray-400 disabled:opacity-30 active:scale-95 transition"
                    >
                        <i className="fas fa-chevron-left text-sm"></i>
                    </button>

                    <div className="flex gap-2">
                        {slots.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => scrollToIndex(i)}
                                className={`h-2 rounded-full transition-all ${
                                    i === activeIndex ? "w-6 bg-indigo-500" : "w-2 bg-white/20"
                                }`}
                            />
                        ))}
                    </div>

                    <button
                        onClick={() => scrollToIndex(Math.min(slots.length - 1, activeIndex + 1))}
                        disabled={activeIndex === slots.length - 1}
                        className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center
                                   text-gray-400 disabled:opacity-30 active:scale-95 transition"
                    >
                        <i className="fas fa-chevron-right text-sm"></i>
                    </button>
                </div>
            </div>
        </div>
    );
}