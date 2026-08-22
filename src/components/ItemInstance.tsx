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
    instance_id?: number;
    isWalkable?: boolean;
};

export function ItemInstance({
                                 name,
                                 position,
                                 rotationY = 0,
                                 scale = 1,
                                 onClick,
                                 onContextMenu,
                                 onPointerEnter,
                                 onPointerLeave,
                                 instance_id,
                                 isWalkable = false,
                             }: ItemProps) {
    const { scene } = useGLTF(`/items/${name}.glb`);
    const cloned = useMemo(() => {
        const clone = scene.clone(true);
        clone.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (isWalkable) {
                    child.userData.isWalkableGround = true;
                }
            }
        });
        return clone;
    }, [scene, isWalkable]);

    const finalY = position[1] + (isWalkable ? 0.018 : 0);

    return (
        <group
            name={instance_id != null ? `item-${instance_id}` : undefined}
            position={[position[0], finalY, position[2]]}
            rotation-y={rotationY}
            scale={scale}
            dispose={null}
            onClick={onClick}
            onContextMenu={onContextMenu}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
            userData={{ instance_id, isWalkableGround: isWalkable }}
        >
            <primitive object={cloned} />
        </group>
    );
}