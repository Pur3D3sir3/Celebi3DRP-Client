import { Canvas } from "@react-three/fiber";
import { useRef } from "react";
import { useGLTF, OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import axios from "axios";
import * as THREE from "three";

interface Props {
  token: string;
  onSelect: () => void;
}

const availableCharacters = [
  { id: 'male1', name: 'Male Agent', model: "/meshy/male1.glb", desc: "Stealth & precision" },
  { id: 'male2', name: 'Male Enforcer', model: "/meshy/male2.glb", desc: "Heavy firepower" },
  // { id: 'female1', name: 'Female Scout', model: "/meshy/female1.glb", desc: "Speed & agility" },
];

function PreviewModel({ model }: { model: string }) {
  const { scene } = useGLTF(model);
  const ref = useRef<THREE.Group>(null!);

  useFrame(() => {
    if (ref.current) ref.current.rotation.y += 0.008;
  });

  return <primitive ref={ref} object={scene.clone()} scale={0.6} position={[0, -1.2, 0]} />;
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl w-full">
        {availableCharacters.map(char => (
          <div
            key={char.id}
            className={`
              group relative 
              backdrop-blur-xl bg-black/30 
              border border-white/10 rounded-2xl 
              overflow-hidden shadow-2xl shadow-black/40 
              hover:shadow-indigo-500/20 hover:border-indigo-500/30 
              transition-all duration-300 hover:-translate-y-2
            `}
          >
            <div className="aspect-square relative bg-gradient-to-b from-black/60 to-transparent">
              <Canvas
                camera={{ position: [0, 1.8, 4.5], fov: 45 }}
                className="!absolute inset-0"
              >
                <ambientLight intensity={0.7} />
                <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
                <PreviewModel model={char.model} />
                <OrbitControls 
                  enablePan={false} 
                  enableZoom={false} 
                  minPolarAngle={Math.PI / 2.2} 
                  maxPolarAngle={Math.PI / 1.8} 
                />
              </Canvas>
            </div>

            <div className="p-6">
              <h3 className="text-2xl font-semibold">{char.name}</h3>
              <p className="mt-1 text-gray-400">{char.desc}</p>

              <button
                onClick={() => handleChoose(char.model)}
                className={`
                  mt-6 w-full py-3 
                  bg-gradient-to-r from-indigo-600 to-indigo-500 
                  hover:from-indigo-500 hover:to-indigo-400 
                  text-white font-medium rounded-lg 
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