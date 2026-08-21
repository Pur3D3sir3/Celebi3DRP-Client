import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

type ItemProps = {
  name: string;
  position: [number, number, number];
  rotationY?: number;
  scale?: number;
  onClick?: (e: any) => void;
  onContextMenu?: (e: any) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  instance_id?: number; // Added
};

export function ItemInstance({ name, position, rotationY = 0, scale = 1, onClick, onContextMenu, onPointerEnter, onPointerLeave, instance_id }: ItemProps) {
  const { scene } = useGLTF(`/items/${name}.glb`);
  const cloned = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    clone.name = `item-${instance_id}`; // For finding
    clone.userData = { instance_id }; // For access
    return clone;
  }, [scene, instance_id]);

  return (
    <group
      position={position}
      rotation-y={rotationY}
      scale={scale}
      dispose={null}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <primitive object={cloned} />
    </group>
  );
}