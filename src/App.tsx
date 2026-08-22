import { Canvas } from "@react-three/fiber";
import { Scene } from "./Scene";
import { SocketProvider } from "./components/SocketProvider";
import { Suspense, useEffect, useState, useRef } from "react";
import axios from "axios";
import AuthForm from "./components/AuthForm";
import CharacterSelect from "./components/CharacterSelect";
import HotelView from "./components/HotelView";
import { useSocket } from "./lib/constants";
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import AdminInventory from "./components/AdminInventory";
import * as THREE from 'three';

axios.defaults.baseURL = "http://localhost:3001";

type ContextMenuType = {
    visible: boolean;
    x: number;
    y: number;
    target: { type: 'ground'; point: { x: number; y: number; z: number } } | { type: 'item'; item: any };
} | null;

function App() {
    const [screen, setScreen] = useState<
        "loading" | "login" | "register" | "character_select" | "hotel" | "game" | "game-loading"
    >("loading");
    const [user, setUser] = useState<any>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
    const [currentScene, setCurrentScene] = useState<number>(1);
    const [activeCharacter, setActiveCharacter] = useState<any>(null);

    useEffect(() => {
        if (token) {
            axios
                .get("/user", { headers: { Authorization: `Bearer ${token}` } })
                .then((res) => {
                    setUser(res.data.user);
                    setScreen("character_select");
                })
                .catch(() => {
                    localStorage.removeItem("token");
                    setScreen("login");
                });
        } else {
            setScreen("login");
        }
    }, []);

    const handleLogin = (newToken: string, newUser: any) => {
        localStorage.setItem("token", newToken);
        setToken(newToken);
        setUser(newUser);
        setScreen("character_select");
    };

    const handleRegister = (newToken: string) => {
        localStorage.setItem("token", newToken);
        setToken(newToken);
        axios
            .get("/user", { headers: { Authorization: `Bearer ${newToken}` } })
            .then((res) => {
                setUser(res.data.user);
                setScreen("character_select");
            })
            .catch(() => setScreen("login"));
    };

    const handleSelectCharacter = async () => {
        try {
            const res = await axios.get("/active-character", {
                headers: { Authorization: `Bearer ${token!}` },
            });
            setActiveCharacter(res.data.character);
            setCurrentScene(res.data.character.current_scene || 1);
            setScreen("hotel");
        } catch {
            setScreen("character_select");
        }
    };

    const handleEnterGame = () => {
        setScreen("game-loading");
        setTimeout(() => setScreen("game"), 100);
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        setToken(null);
        setUser(null);
        setActiveCharacter(null);
        setCurrentScene(1);
        setScreen("login");
    };

    if (screen === "loading") {
        return (
            <div className="min-h-screen flex items-center justify-center text-gray-400 px-4">
                Loading...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#0f0f11] to-[#0a0a0f] text-gray-100 antialiased">
            {screen === "login" || screen === "register" ? (
                <AuthForm
                    mode={screen}
                    onSuccess={screen === "login" ? handleLogin : handleRegister}
                    onSwitch={() => setScreen(screen === "login" ? "register" : "login")}
                />
            ) : screen === "character_select" ? (
                <CharacterSelect
                    token={token!}
                    onSelect={handleSelectCharacter}
                    onLogout={handleLogout}
                />
            ) : screen === "hotel" ? (
                <HotelView
                    character={activeCharacter}
                    onEnterWorld={() => {
                        setCurrentScene(activeCharacter?.current_scene || 1);
                        handleEnterGame();
                    }}
                    onLogout={handleLogout}
                    onChangeCharacter={() => setScreen("character_select")}
                />
            ) : (screen === "game" || screen === "game-loading") ? (
                <>
                    {screen === "game" && (
                        <button
                            onClick={() => setScreen("hotel")}
                            className="
                fixed top-3 right-3 sm:top-4 sm:right-4 z-[800]
                flex items-center gap-1.5 sm:gap-2
                px-3 py-2 sm:px-5 sm:py-3 rounded-xl
                bg-indigo-950/70 hover:bg-indigo-900/80 backdrop-blur-md
                border border-indigo-500/50 hover:border-indigo-400
                text-white text-sm sm:text-base font-medium
                shadow-xl shadow-black/40
                transition-all duration-200 hover:scale-105 active:scale-95
              "
                        >
                            <i className="fas fa-home text-base sm:text-lg"></i>
                            <span className="hidden xs:inline">Back to Lobby</span>
                            <span className="xs:hidden">Lobby</span>
                        </button>
                    )}
                    <div className="fixed inset-0 w-full h-full overflow-hidden bg-black">
                        <SocketProvider token={token!} onSceneChange={setCurrentScene}>
                            <GameContent
                                currentScene={currentScene}
                                isInitialLoading={screen === "game-loading"}
                                user={user}
                            />
                        </SocketProvider>
                    </div>
                </>
            ) : null}
        </div>
    );
}

function GameContent({
                         currentScene,
                         isInitialLoading,
                         user
                     }: {
    currentScene: number;
    isInitialLoading: boolean;
    user: any;
}) {
    const { isSceneReady, characters, sceneItems, socket } = useSocket();
    const [dataReceived, setDataReceived] = useState(false);
    const [loaderVisible, setLoaderVisible] = useState(true);
    const [contextMenu, setContextMenu] = useState<ContextMenuType>(null);
    const sceneRef = useRef<{
        handleWalk: (point: {x: number; y: number; z: number}) => void;
        handleInteract: (item: any) => void;
        handleExamine: (item: any) => void;
        getAzimuth: () => number;
        getLocalPos: () => THREE.Vector3;
    } | null>(null);

    const [editMode, setEditMode] = useState(false);
    const [inventoryOpen, setInventoryOpen] = useState(false);
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [placingItem, setPlacingItem] = useState<{ item_id: number; name: string } | null>(null);
    const transformControlsRef = useRef<TransformControls>(null);
    const [runEnabled, setRunEnabled] = useState(false);
    const [energy, setEnergy] = useState(100);
    const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
    const isMovingRef = useRef(false);
    const [floorColor, setFloorColor] = useState("#70543E");

    useEffect(() => {
        let cancelled = false;
        axios.get(`/scene/${currentScene}`)
            .then((res) => {
                if (!cancelled && res.data?.scene?.floor_color) {
                    setFloorColor(res.data.scene.floor_color);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setFloorColor(currentScene === 2 ? "#4A4A4A" : "#70543E");
                }
            });
        return () => { cancelled = true; };
    }, [currentScene]);

    useEffect(() => {
        const interval = setInterval(() => {
            setEnergy((prev) => {
                if (runEnabled && isMovingRef.current) {
                    const next = Math.max(0, prev - 1.15);
                    if (next <= 0) {
                        setRunEnabled(false);
                    }
                    return next;
                } else {
                    return Math.min(100, prev + 0.65);
                }
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [runEnabled]);

    useEffect(() => {
        const hideMenu = () => setContextMenu(null);
        window.addEventListener('click', hideMenu);
        return () => window.removeEventListener('click', hideMenu);
    }, []);

    useEffect(() => {
        if (isSceneReady && (characters.length > 0 || sceneItems.length > 0)) {
            setDataReceived(true);
            const fadeTimer = setTimeout(() => {
                setLoaderVisible(false);
            }, 500);
            return () => clearTimeout(fadeTimer);
        }
    }, [isSceneReady, characters.length, sceneItems.length]);

    const handleSave = () => {
        socket.emit('admin_save_scene', (response: any) => {
            if (response.status === 'ok') {
                setInventoryOpen(false);
                setEditMode(false);
                setSelectedItemId(null);
                setPlacingItem(null);
            }
        });
    };

    useEffect(() => {
        const canvas = minimapCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let animationFrameId: number;

        const darkenColor = (hex: string, factor: number): string => {
            const color = hex.replace('#', '');
            const r = Math.floor(parseInt(color.substr(0, 2), 16) * factor);
            const g = Math.floor(parseInt(color.substr(2, 2), 16) * factor);
            const b = Math.floor(parseInt(color.substr(4, 2), 16) * factor);
            return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        };
        const terrainColor = darkenColor(floorColor, 0.38);

        const drawMinimap = () => {
            const width = canvas.width;
            const height = canvas.height;
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(width, height) / 2 - 8;
            const mapScale = 4.2;
            const blobScale = 0.52;

            ctx.clearRect(0, 0, width, height);

            const bgGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
            bgGradient.addColorStop(0, 'rgba(20, 20, 35, 0.92)');
            bgGradient.addColorStop(0.65, 'rgba(12, 12, 25, 0.96)');
            bgGradient.addColorStop(1, 'rgba(0, 0, 8, 1)');
            ctx.fillStyle = bgGradient;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius + 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = terrainColor;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius - 6, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#2a2a2a';
            ctx.lineWidth = 3.2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius - 2.5, 0, Math.PI * 2);
            ctx.stroke();

            const playerPos = sceneRef.current?.getLocalPos() ?? new THREE.Vector3(0, 0, 0);
            const heading = sceneRef.current?.getAzimuth() || 0;

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(heading);

            sceneItems.forEach((item) => {
                const dx = (item.pos_x - playerPos.x) * mapScale;
                const dz = (item.pos_z - playerPos.z) * mapScale;
                const dist = Math.hypot(dx, dz);
                if (dist > radius * 0.92 || item.is_walkable) return;

                ctx.save();
                ctx.translate(dx, dz);
                ctx.rotate(item.rotation_y || 0);

                const itemW = item.width * (item.scale || 1);
                const itemH = item.height * (item.scale || 1);
                const halfW = (itemW * mapScale * blobScale) / 2;
                const halfH = (itemH * mapScale * blobScale) / 2;

                ctx.fillStyle = '#1f1f1f';
                ctx.fillRect(-halfW, -halfH, itemW * mapScale * blobScale, itemH * mapScale * blobScale);

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.lineWidth = 0.8;
                ctx.strokeRect(-halfW, -halfH, itemW * mapScale * blobScale, itemH * mapScale * blobScale);

                ctx.restore();
            });

            sceneItems.forEach((item) => {
                if (!item.is_interactable) return;
                const dx = (item.pos_x - playerPos.x) * mapScale;
                const dz = (item.pos_z - playerPos.z) * mapScale;
                const dist = Math.hypot(dx, dz);
                if (dist > radius * 0.92) return;

                ctx.fillStyle = '#ffd700';
                ctx.beginPath();
                ctx.arc(dx, dz, 3.2, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(dx, dz, 1.6, 0, Math.PI * 2);
                ctx.fill();
            });

            characters.forEach((char) => {
                if (char.id === socket.id) return;
                const dx = (char.position[0] - playerPos.x) * mapScale;
                const dz = (char.position[2] - playerPos.z) * mapScale;
                const dist = Math.hypot(dx, dz);
                if (dist > radius * 0.92) return;

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(dx, dz, 2.8, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.restore();

            ctx.shadowColor = '#00bfff';
            ctx.shadowBlur = 5;
            ctx.fillStyle = '#0000ff';
            ctx.beginPath();
            ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            const compass = [
                { label: 'N', angle: 0 },
                { label: 'E', angle: Math.PI / 2 },
                { label: 'S', angle: Math.PI },
                { label: 'W', angle: (3 * Math.PI) / 2 },
            ];

            const labelRadius = radius - 13;

            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            compass.forEach(({ label, angle }) => {
                const screenAngle = angle + heading;
                const x = centerX + Math.cos(screenAngle) * labelRadius;
                const y = centerY + Math.sin(screenAngle) * labelRadius;

                ctx.shadowColor = 'rgba(255, 255, 255, 0.55)';
                ctx.shadowBlur = 3;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
                ctx.fillText(label, x, y);

                ctx.shadowBlur = 0;
                ctx.fillText(label, x, y);
            });

            animationFrameId = requestAnimationFrame(drawMinimap);
        };

        drawMinimap();
        return () => cancelAnimationFrame(animationFrameId);
    }, [sceneItems, characters, socket.id, sceneRef, currentScene, floorColor]);

    if (isInitialLoading || !dataReceived || loaderVisible) {
        let title = "Entering Velvet Horizon";
        let subtitle = "Connecting • Loading players & world";
        if (dataReceived) {
            title = "Finalizing Scene";
            subtitle = "Rendering models • Almost ready...";
        }
        return (
            <div
                className={`
          fixed inset-0 w-full h-full flex flex-col items-center justify-center
          text-white bg-gradient-to-b from-gray-950 via-indigo-950/50 to-black z-50
          transition-opacity duration-800 ease-out
          ${!loaderVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        `}
            >
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6 sm:mb-8 animate-pulse-slow px-4 text-center">
                    {title}
                </div>
                <div className="w-64 sm:w-80 md:w-96 h-2 bg-gray-800/50 rounded-full overflow-hidden mb-6 relative">
                    <div
                        className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-loading-bar"
                    />
                </div>
                <div className="text-sm sm:text-base md:text-lg opacity-80 max-w-md text-center px-6">
                    {subtitle}
                </div>
                <style>{`
          @keyframes loading-bar {
            0% { transform: translateX(-200%); }
            100% { transform: translateX(200%); }
          }
          .animate-loading-bar {
            animation: loading-bar 4s linear infinite;
          }
          .animate-pulse-slow {
            animation: pulse 4.5s ease-in-out infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 0.7; }
            50% { opacity: 1; }
          }
        `}</style>
            </div>
        );
    }

    return (
        <>
            <Canvas
                className="w-full h-full"
                camera={{ fov: 60, near: 0.1, far: 300, position: [0, 7, 8] }}
                shadows
                dpr={[1, 1.5]}
                frameloop="always"
                gl={{ powerPreference: "high-performance", antialias: true }}
                onContextMenu={(e) => e.nativeEvent.preventDefault()}
            >
                <Scene
                    ref={sceneRef}
                    currentScene={currentScene}
                    setContextMenu={setContextMenu}
                    userRank={user?.rank || 'user'}
                    editMode={editMode}
                    selectedItemId={selectedItemId}
                    setSelectedItemId={setSelectedItemId}
                    placingItem={placingItem}
                    setPlacingItem={setPlacingItem}
                    transformControlsRef={transformControlsRef}
                    runEnabled={runEnabled}
                    onMovingChange={(moving) => { isMovingRef.current = moving; }}
                />
            </Canvas>

            {contextMenu?.visible && (
                <ContextMenuComponent menu={contextMenu} setMenu={setContextMenu} sceneRef={sceneRef} />
            )}

            {user?.rank === 'admin' && (
                <button
                    onClick={() => {
                        setEditMode(!editMode);
                        setInventoryOpen(true);
                    }}
                    className="
            fixed bottom-3 left-3 sm:bottom-4 sm:left-4 z-[800]
            flex items-center gap-1.5 sm:gap-2
            px-3 py-2 sm:px-5 sm:py-3 rounded-xl
            bg-indigo-950/70 hover:bg-indigo-900/80 backdrop-blur-md
            border border-indigo-500/50 hover:border-indigo-400
            text-white text-sm sm:text-base font-medium
            shadow-xl shadow-black/40
            transition-all duration-200 hover:scale-105 active:scale-95
          "
                >
                    <i className="fas fa-toolbox text-base sm:text-lg"></i>
                    <span className="hidden sm:inline">Admin Edit</span>
                    <span className="sm:hidden">Admin</span>
                </button>
            )}

            {inventoryOpen && (
                <AdminInventory
                    open={inventoryOpen}
                    onClose={() => {
                        setInventoryOpen(false);
                        setEditMode(false);
                        setSelectedItemId(null);
                        setPlacingItem(null);
                    }}
                    onSave={handleSave}
                    selectedItemId={selectedItemId}
                    setSelectedItemId={setSelectedItemId}
                    placingItem={placingItem}
                    setPlacingItem={setPlacingItem}
                    currentScene={currentScene}
                    socket={socket}
                    sceneItems={sceneItems}
                    transformControls={transformControlsRef}
                    className="fixed inset-0 z-[9999] overflow-auto bg-black/60 backdrop-blur-sm"
                />
            )}

            <div className="fixed top-3 left-3 sm:top-6 sm:left-6 z-[900] flex flex-col items-center gap-2 sm:gap-3 pointer-events-auto select-none">
                <div className="relative w-28 h-28 sm:w-36 sm:h-36 md:w-40 md:h-40 rounded-full overflow-hidden bg-gradient-to-b from-gray-900/95 to-gray-950/95
                        border-[3px] sm:border-4 border-indigo-600/50 hover:border-indigo-400/80
                        shadow-2xl shadow-black/60 backdrop-blur-lg
                        transition-all duration-300 hover:scale-[1.03] hover:shadow-indigo-600/30
                        cursor-pointer group">
                    <div className="absolute inset-0">
                        <canvas ref={minimapCanvasRef} width={160} height={160} className="w-full h-full" />
                    </div>
                    <div className="absolute inset-1 rounded-full border border-indigo-500/20 pointer-events-none" />
                    <div className="absolute inset-0 rounded-full bg-indigo-500/5 blur-xl animate-pulse-slow pointer-events-none" />
                </div>

                <div className="flex flex-row gap-2 sm:gap-3 mt-1 sm:mt-2">
                    <div className="flex flex-col items-center gap-1">
                        <div
                            className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-all duration-300 group
                           shadow-xl shadow-black/40 hover:scale-110 hover:shadow-indigo-400/30
                           cursor-pointer border-2 sm:border-3 ${runEnabled
                                ? 'bg-gradient-to-b from-emerald-500/90 to-emerald-600/90 border-emerald-400/80 hover:border-emerald-300/90 shadow-emerald-500/40'
                                : 'bg-gray-900/90 border-indigo-500/40 hover:border-indigo-400/70 shadow-indigo-500/20'}`}
                            onClick={() => {
                                if (energy > 5) setRunEnabled(!runEnabled);
                            }}
                        >
                            <i className={`fas fa-running absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-sm sm:text-lg
                           ${runEnabled ? 'text-emerald-900 drop-shadow-sm' : 'text-indigo-300 group-hover:text-indigo-100'}`} />
                            {runEnabled && (
                                <div className="absolute inset-0 rounded-full bg-emerald-400/30 blur animate-ping-slow" />
                            )}
                        </div>
                        <div className={`text-[9px] sm:text-[10px] font-medium whitespace-nowrap
                            ${runEnabled ? 'text-emerald-400' : 'text-gray-400'}`}>
                            {runEnabled ? 'RUN' : 'WALK'}
                        </div>
                        <div className="w-10 sm:w-12 h-1.5 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                            <div
                                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
                                style={{ width: `${energy}%` }}
                            />
                        </div>
                    </div>

                    <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-b from-blue-900/90 to-blue-950/90
                          border-2 sm:border-3 border-blue-500/50 hover:border-blue-400/80
                          shadow-xl shadow-black/40 hover:scale-110 hover:shadow-blue-500/30
                          transition-all duration-300 cursor-pointer group">
                        <i className="fas fa-globe absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-sm sm:text-lg text-blue-300 group-hover:text-blue-100 drop-shadow-sm" />
                        <div className="absolute inset-0 rounded-full bg-blue-500/20 blur -m-1" />
                        <div className="absolute -bottom-5 sm:-bottom-6 left-1/2 transform -translate-x-1/2 text-[9px] sm:text-[10px] font-medium text-blue-400 group-hover:text-blue-200 whitespace-nowrap">
                            WORLD
                        </div>
                        <button
                            className="absolute inset-0 rounded-full opacity-0 hover:opacity-100"
                            onClick={() => console.log('Open world map - TBD')}
                        />
                    </div>
                </div>
            </div>

            <style>{`
        @keyframes ping-slow {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .animate-ping-slow {
          animation: ping-slow 2s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }
      `}</style>
        </>
    );
}

function ContextMenuComponent({ menu, setMenu, sceneRef }: { menu: NonNullable<ContextMenuType>; setMenu: (m: ContextMenuType) => void; sceneRef: React.RefObject<any> }) {
    const { x, y, target } = menu;
    let options: { label: string; onClick: () => void }[] = [];

    if (target.type === 'ground') {
        options = [
            { label: 'Walk here', onClick: () => { sceneRef.current?.handleWalk(target.point); setMenu(null); } },
        ];
    } else if (target.type === 'item') {
        const item = target.item;
        const itemName = item.name.replace(/_/g, ' ');
        options = [
            { label: `Examine ${itemName}`, onClick: () => { sceneRef.current?.handleExamine(item); setMenu(null); } },
        ];
        if (item.is_interactable && item.interaction_type) {
            const action = item.interaction_type.charAt(0).toUpperCase() + item.interaction_type.slice(1);
            options.unshift({ label: `${action} ${itemName}`, onClick: () => { sceneRef.current?.handleInteract(item); setMenu(null); } });
        }
    }

    const menuStyle: React.CSSProperties = {
        position: 'absolute',
        left: Math.min(x, window.innerWidth - 180),
        top: Math.min(y, window.innerHeight - 120),
        zIndex: 2000,
    };

    return (
        <div
            style={menuStyle}
            className="bg-gray-900 text-white border border-gray-700 rounded-lg shadow-lg min-w-[150px] max-w-[90vw]"
        >
            <ul className="py-1">
                {options.map((opt, i) => (
                    <li
                        key={i}
                        className="px-4 py-2.5 hover:bg-indigo-600 cursor-pointer transition-colors text-sm"
                        onClick={opt.onClick}
                    >
                        {opt.label}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default App;