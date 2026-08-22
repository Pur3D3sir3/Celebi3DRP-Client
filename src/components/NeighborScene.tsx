import { useMemo } from "react";
import * as THREE from "three";
import { ItemInstance } from "./ItemInstance";
import { SceneItem } from "../lib/types";

type NeighborSceneProps = {
    sceneId: number;
    offset: [number, number, number];
    items: SceneItem[];
    floorColor: string;
    planeSize?: [number, number];
    opacity?: number;
};

export function NeighborScene({
                                  sceneId,
                                  offset,
                                  items,
                                  floorColor,
                                  planeSize = [30, 30],
                                  opacity = 1,
                              }: NeighborSceneProps) {
    const floorMat = useMemo(
        () =>
            new THREE.MeshStandardMaterial({
                color: floorColor,
                transparent: true,
                opacity: 0.92 * opacity,
            }),
        [floorColor, opacity]
    );

    return (
        <group position={offset} userData={{ neighborScene: sceneId }}>
            <mesh rotation-x={-Math.PI / 2} receiveShadow material={floorMat}>
                <planeGeometry args={planeSize} />
            </mesh>

            {items.map((item) => {
                const position: [number, number, number] = [
                    item.pos_x,
                    item.pos_y || 0,
                    item.pos_z,
                ];
                return (
                    <ItemInstance
                        key={`neighbor-${sceneId}-${item.instance_id}`}
                        name={item.name}
                        position={position}
                        rotationY={item.rotation_y || 0}
                        scale={item.scale || 1}
                        instance_id={item.instance_id}
                    />
                );
            })}
        </group>
    );
}