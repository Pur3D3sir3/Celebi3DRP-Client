import { Html } from "@react-three/drei";
import { useState, useMemo } from "react";
import _ from 'lodash';
interface AdminInventoryProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  selectedItemId: number | null;
  setSelectedItemId: (id: number | null) => void;
  placingItem: { item_id: number; name: string } | null;
  setPlacingItem: (item: { item_id: number; name: string } | null) => void;
  currentScene: number;
  socket: any;
  sceneItems: any[];
  transformControls: any;
}
const availableItems = [
  { item_id: 1, name: 'soda_can', display: 'Soda Can' },
  { item_id: 2, name: 'rock', display: 'Rock' },
  // Add more as needed
];
export default function AdminInventory({
  open,
  onClose,
  onSave,
  selectedItemId,
  setSelectedItemId,
  placingItem,
  setPlacingItem,
  currentScene,
  socket,
  sceneItems,
  transformControls,
}: AdminInventoryProps) {
  if (!open) return null;
  const selectedItem = sceneItems.find(i => i.instance_id === selectedItemId);
  const debouncedUpdate = useMemo(() => _.debounce((data) => {
    socket.emit('admin_update_item', data);
  }, 300), [socket]);
  const handleModeChange = (mode: 'translate' | 'rotate' | 'scale') => {
    if (transformControls.current) {
      transformControls.current.setMode(mode);
    }
  };
  const handleDelete = () => {
    if (selectedItemId) {
      socket.emit('admin_delete_item', { instance_id: selectedItemId }, () => {
        setSelectedItemId(null);
      });
    }
  };
  return (
    <div className="fixed z-[9999] top-0 left-0 w-80 h-full bg-gray-900/95 p-4 text-white overflow-y-auto z-50 rounded-r-xl border-r border-indigo-500/50">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Admin Tools</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <i className="fas fa-times"></i>
        </button>
      </div>
      <h3 className="text-lg mb-3 border-b border-gray-700 pb-2">Place New Item</h3>
      <div className="grid grid-cols-2 gap-2 mb-6">
        {availableItems.map(item => (
          <button
            key={item.item_id}
            onClick={() => setPlacingItem({ item_id: item.item_id, name: item.name })}
            className={`p-3 rounded text-center transition ${
              placingItem?.item_id === item.item_id
                ? 'bg-indigo-700 border-2 border-indigo-400'
                : 'bg-gray-800 hover:bg-indigo-800'
            }`}
          >
            {item.display}
          </button>
        ))}
      </div>
      {placingItem && (
        <p className="text-sm text-gray-300 mb-4">
          Click on ground to place <strong>{placingItem.name}</strong>
        </p>
      )}
      {selectedItem && (
        <>
          <h3 className="text-lg mb-3 border-b border-gray-700 pb-2">
            Editing: {selectedItem.name}
          </h3>
          <div className="flex gap-2 mb-4">
            <button onClick={() => handleModeChange('translate')} className="flex-1 px-3 py-2 bg-indigo-700 rounded hover:bg-indigo-600">
              Move
            </button>
            <button onClick={() => handleModeChange('rotate')} className="flex-1 px-3 py-2 bg-indigo-700 rounded hover:bg-indigo-600">
              Rotate
            </button>
            <button onClick={() => handleModeChange('scale')} className="flex-1 px-3 py-2 bg-indigo-700 rounded hover:bg-indigo-600">
              Scale
            </button>
          </div>
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm mb-1">Height (Y)</label>
              <input
                type="range"
                min="-5"
                max="10"
                step="0.1"
                defaultValue={selectedItem.pos_y || 0}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (transformControls.current?.object) {
                    transformControls.current.object.position.y = val;
                    debouncedUpdate({ instance_id: selectedItemId, pos_y: val });
                  }
                }}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Rotation Y (°)</label>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                defaultValue={(selectedItem.rotation_y || 0) * (180 / Math.PI)}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) * (Math.PI / 180);
                  if (transformControls.current?.object) {
                    transformControls.current.object.rotation.y = val;
                    debouncedUpdate({ instance_id: selectedItemId, rotation_y: val });
                  }
                }}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Scale</label>
              <input
                type="range"
                min="0.1"
                max="5"
                step="0.05"
                defaultValue={selectedItem.scale || 1}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (transformControls.current?.object) {
                    transformControls.current.object.scale.set(val, val, val);
                    debouncedUpdate({ instance_id: selectedItemId, scale: val });
                  }
                }}
                className="w-full"
              />
            </div>
          </div>
          <button
            onClick={handleDelete}
            className="w-full py-3 bg-red-700 hover:bg-red-600 rounded mb-4 font-medium"
          >
            Delete Item
          </button>
        </>
      )}
      <button
        onClick={onSave}
        className="w-full py-3 bg-green-700 hover:bg-green-600 rounded font-bold text-lg"
      >
        Save & Close
      </button>
    </div>
  );
}