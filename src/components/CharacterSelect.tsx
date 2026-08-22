import { Canvas } from "@react-three/fiber";
import { useRef, useState, useEffect } from "react";
import { useGLTF, OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import axios from "axios";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";

interface Props {
    token: string;
    onSelect: () => void;
}

const availableModels = [
    { id: 'male1', name: 'Male Agent', model: "/meshy/male1.glb", desc: "Stealth & precision" },
    { id: 'male2', name: 'Male Enforcer', model: "/meshy/male2.glb", desc: "Heavy firepower" },
];

function PreviewModel({ model }: { model: string }) {
    const { scene } = useGLTF(model);
    const ref = useRef<THREE.Group>(null!);
    const clone = SkeletonUtils.clone(scene);

    useFrame(() => {
        if (ref.current) ref.current.rotation.y += 0.008;
    });

    return (
        <group ref={ref} position={[0, -1.35, 0]} scale={0.85}>
            <primitive object={clone} />
        </group>
    );
}

export default function CharacterSelect({ token, onSelect }: Props) {
    const [characters, setCharacters] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [selectedModel, setSelectedModel] = useState("/meshy/male1.glb");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const loadCharacters = async () => {
        try {
            const res = await axios.get("/characters", {
                headers: { Authorization: `Bearer ${token}` }
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
            await axios.post("/select-character", { character_id: characterId }, {
                headers: { Authorization: `Bearer ${token}` }
            });
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
            const res = await axios.post("/characters", {
                name: newName.trim(),
                model: selectedModel
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Auto-select the new character
            await axios.post("/select-character", { character_id: res.data.character.id }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            onSelect();
        } catch (err: any) {
            setError(err.response?.data?.error || "Failed to create character");
            setBusy(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center text-gray-400">
                Loading characters...
            </div>
        );
    }

    // ── Create mode ──
    if (creating) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6">
                <div className="w-full max-w-2xl">
                    <button
                        onClick={() => { setCreating(false); setError(""); }}
                        className="mb-8 text-indigo-400 hover:text-indigo-300 flex items-center gap-2"
                    >
                        ← Back to characters
                    </button>

                    <h1 className="text-4xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-400">
                        Create Character
                    </h1>
                    <p className="text-gray-400 mb-10">Choose a name and appearance</p>

                    <div className="space-y-8">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Character Name</label>
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                maxLength={32}
                                placeholder="Enter name..."
                                className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-white focus:outline-none focus:border-indigo-500/50"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-4">Appearance</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                {availableModels.map((m) => (
                                    <button
                                        key={m.id}
                                        onClick={() => setSelectedModel(m.model)}
                                        className={`
                                            relative overflow-hidden rounded-2xl border-2 transition-all
                                            ${selectedModel === m.model
                                            ? 'border-indigo-500 shadow-lg shadow-indigo-500/30'
                                            : 'border-white/10 hover:border-white/30'}
                                        `}
                                    >
                                        <div className="aspect-[4/5] bg-gradient-to-b from-[#0f0f18] to-[#08080f]">
                                            <Canvas camera={{ position: [0, 1.1, 3.8], fov: 38 }}>
                                                <ambientLight intensity={0.55} />
                                                <directionalLight position={[4, 8, 5]} intensity={1.6} />
                                                <Environment preset="city" />
                                                <PreviewModel model={m.model} />
                                                <ContactShadows position={[0, -1.4, 0]} opacity={0.55} scale={8} blur={2.2} far={3} />
                                            </Canvas>
                                        </div>
                                        <div className="p-4 text-left">
                                            <div className="font-semibold">{m.name}</div>
                                            <div className="text-sm text-gray-400">{m.desc}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {error && (
                            <p className="text-red-400 text-center bg-red-950/30 py-2 rounded-lg">{error}</p>
                        )}

                        <button
                            onClick={handleCreate}
                            disabled={busy}
                            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-medium rounded-xl shadow-lg shadow-indigo-500/30 disabled:opacity-50"
                        >
                            {busy ? "Creating..." : "Create & Play"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Character list (3 slots) ──
    const slots = [0, 1, 2];

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6">
            <div className="text-center mb-12">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-400">
                    Select Character
                </h1>
                <p className="mt-3 text-lg text-gray-400">
                    Choose who you want to play as, or create a new character
                </p>
            </div>

            {error && (
                <p className="mb-6 text-red-400 bg-red-950/30 px-4 py-2 rounded-lg">{error}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl w-full">
                {slots.map((slotIndex) => {
                    const char = characters[slotIndex];

                    if (char) {
                        return (
                            <div
                                key={char.id}
                                className="group relative backdrop-blur-xl bg-black/40 border border-white/10 rounded-2xl overflow-hidden shadow-2xl hover:border-indigo-500/40 transition-all hover:-translate-y-1"
                            >
                                <div className="aspect-[4/5] relative bg-gradient-to-b from-[#0f0f18] to-[#08080f]">
                                    <Canvas camera={{ position: [0, 1.1, 3.8], fov: 38 }}>
                                        <ambientLight intensity={0.55} />
                                        <directionalLight position={[4, 8, 5]} intensity={1.6} />
                                        <Environment preset="city" />
                                        <PreviewModel model={char.model} />
                                        <ContactShadows position={[0, -1.4, 0]} opacity={0.55} scale={8} blur={2.2} far={3} />
                                        <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 2.4} maxPolarAngle={Math.PI / 1.7} target={[0, 0.4, 0]} />
                                    </Canvas>
                                </div>
                                <div className="p-6">
                                    <h3 className="text-2xl font-semibold">{char.name}</h3>
                                    <p className="mt-1 text-sm text-gray-400">
                                        {char.model.includes('male2') ? 'Male Enforcer' : 'Male Agent'}
                                    </p>
                                    <button
                                        onClick={() => handlePlay(char.id)}
                                        disabled={busy}
                                        className="mt-6 w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-medium rounded-xl shadow-lg shadow-indigo-500/30 disabled:opacity-50"
                                    >
                                        Play
                                    </button>
                                </div>
                            </div>
                        );
                    }

                    // Empty slot
                    return (
                        <button
                            key={`empty-${slotIndex}`}
                            onClick={() => setCreating(true)}
                            className="group relative flex flex-col items-center justify-center aspect-[3/4] backdrop-blur-xl bg-black/20 border-2 border-dashed border-white/15 rounded-2xl hover:border-indigo-500/50 hover:bg-indigo-950/20 transition-all"
                        >
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 group-hover:bg-indigo-500/20 transition">
                                <i className="fas fa-plus text-2xl text-gray-400 group-hover:text-indigo-300"></i>
                            </div>
                            <span className="text-lg font-medium text-gray-400 group-hover:text-indigo-300">
                                Add Character
                            </span>
                            <span className="mt-1 text-sm text-gray-600">
                                Slot {slotIndex + 1} of 3
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}