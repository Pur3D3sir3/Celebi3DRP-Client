import { Canvas } from "@react-three/fiber";
import { useRef } from "react";
import { useGLTF, OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import axios from "axios";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";

interface Props {
    token: string;
    onSelect: () => void;
}

const availableCharacters = [
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
    const handleChoose = async (model: string) => {
        try {
            await axios.post("/select-character", { model }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            onSelect();
        } catch (err) {
            console.error("Error selecting character:", err);
            alert("Failed to select character. Please try again.");
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6">
            <div className="text-center mb-12">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-400">
                    Choose Your Character
                </h1>
                <p className="mt-3 text-lg text-gray-400 max-w-2xl">
                    Select the avatar that best fits your style in Velvet Horizon
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-5xl w-full">
                {availableCharacters.map(char => (
                    <div
                        key={char.id}
                        className={`
              group relative 
              backdrop-blur-xl bg-black/40 
              border border-white/10 rounded-2xl 
              overflow-hidden shadow-2xl shadow-black/50 
              hover:shadow-indigo-500/25 hover:border-indigo-500/40 
              transition-all duration-300 hover:-translate-y-2
            `}
                    >
                        <div className="aspect-[4/5] relative bg-gradient-to-b from-[#0f0f18] to-[#08080f]">
                            <Canvas
                                camera={{ position: [0, 1.1, 3.8], fov: 38 }}
                                className="!absolute inset-0"
                                gl={{ antialias: true }}
                            >
                                <ambientLight intensity={0.55} />
                                <directionalLight position={[4, 8, 5]} intensity={1.6} castShadow />
                                <directionalLight position={[-3, 4, -2]} intensity={0.5} />
                                <Environment preset="city" />
                                <PreviewModel model={char.model} />
                                <ContactShadows position={[0, -1.4, 0]} opacity={0.55} scale={8} blur={2.2} far={3} />
                                <OrbitControls
                                    enablePan={false}
                                    enableZoom={false}
                                    minPolarAngle={Math.PI / 2.4}
                                    maxPolarAngle={Math.PI / 1.7}
                                    target={[0, 0.4, 0]}
                                />
                            </Canvas>
                        </div>

                        <div className="p-6">
                            <h3 className="text-2xl font-semibold">{char.name}</h3>
                            <p className="mt-1 text-gray-400">{char.desc}</p>

                            <button
                                onClick={() => handleChoose(char.model)}
                                className={`
                  mt-6 w-full py-3.5 
                  bg-gradient-to-r from-indigo-600 to-indigo-500 
                  hover:from-indigo-500 hover:to-indigo-400 
                  text-white font-medium rounded-xl 
                  shadow-lg shadow-indigo-500/30 
                  transition-all duration-200
                `}
                            >
                                Select Character
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}