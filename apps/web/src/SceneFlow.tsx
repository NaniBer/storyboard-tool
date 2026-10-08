import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import type { Scene } from './api';

const sceneSpacing = 336;
const OpenSceneContext = createContext<(id: string) => void>(() => undefined);

type SceneNode = Node<{ scene: Scene; number: number; shotCount?: number }, 'scene'>;

export type SceneFlowProps = {
  scenes: Scene[];
  selectedId?: string | null;
  shotCounts?: Record<string, number>;
  busy?: boolean;
  onOpen: (id: string) => void;
  onReorder?: (ids: string[]) => Promise<void> | void;
};

function layoutNodes(scenes: Scene[], selectedId?: string | null, shotCounts?: Record<string, number>): SceneNode[] {
  return scenes.map((scene, index) => ({
    id: scene.id,
    type: 'scene',
    position: { x: index * sceneSpacing, y: 0 },
    data: { scene, number: index + 1, shotCount: shotCounts?.[scene.id] ?? scene.shotCount },
    selected: scene.id === selectedId,
  }));
}

function SceneNodeCard({ data }: NodeProps<SceneNode>) {
  const { scene, number, shotCount } = data;
  const onOpen = useContext(OpenSceneContext);

  return (
    <div className={"scene-flow-card relative min-h-[230px] overflow-hidden rounded-[12px] bg-[#fff] shadow-[0_16px_32px_-21px_rgba(41,_37,_30,_.36)] [transition:box-shadow_.2s_ease,_transform_.2s_ease] [&:hover]:[transform:translateY(-2px)] [&:hover]:shadow-[0_20px_34px_-19px_rgba(41,_37,_30,_.38)] motion-reduce:[transition:none]"}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className={"scene-flow-card-top flex justify-between gap-[8px] p-[16px_18px_12px] text-[#925036] text-[10px] font-bold tracking-[.04em] uppercase [&_span:last-child]:text-[#56624f]"}>
        <span>Scene {String(number).padStart(2, '0')}</span>
        {shotCount !== undefined && <span>{shotCount} {shotCount === 1 ? 'shot' : 'shots'}</span>}
      </div>
      <div className={"scene-flow-card-body min-h-[136px] p-[0_18px] [&_h3]:m-0 [&_h3]:text-ink [&_h3]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h3]:text-[21px] [&_h3]:font-normal [&_h3]:leading-[1.24] [&_h3]:[overflow-wrap:anywhere] [&_p]:[display:-webkit-box] [&_p]:m-[12px_0_0] [&_p]:overflow-hidden [&_p]:text-[#5e584f] [&_p]:text-[12px] [&_p]:leading-[1.6] [&_p]:[overflow-wrap:anywhere] [&_p]:[-webkit-box-orient:vertical] [&_p]:[-webkit-line-clamp:3]"}>
        <h3>{scene.title}</h3>
        <p>{scene.description || 'Open this scene to shape its story and add shots.'}</p>
      </div>
      <button className={"scene-flow-open flex items-center justify-between w-full min-h-[45px] p-[11px_18px] border-0 [border-top:1px_solid_#eee9e3] text-[#925036] bg-[#fff] text-[11px] font-bold text-left cursor-pointer [&:hover]:text-[#603a28] [&:hover]:bg-[#fbf6ef] [&:focus-visible]:[outline:3px_solid_#a3573c] [&:focus-visible]:[outline-offset:-3px] [&_svg]:w-[16px] [&_svg]:h-[16px] nodrag"} type="button" onClick={() => onOpen(scene.id)}>
        Open scene
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

const nodeTypes = { scene: SceneNodeCard };

export default function SceneFlow({ scenes, selectedId, shotCounts, busy = false, onOpen, onReorder }: SceneFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<SceneNode>(layoutNodes(scenes, selectedId, shotCounts));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestProps = useRef({ scenes, selectedId, shotCounts });
  latestProps.current = { scenes, selectedId, shotCounts };

  useEffect(() => { setNodes(layoutNodes(scenes, selectedId, shotCounts)); }, [scenes, selectedId, shotCounts, setNodes]);

  const edges = useMemo<Edge[]>(() => scenes.slice(0, -1).map((scene, index) => ({
    id: `${scene.id}-${scenes[index + 1].id}`,
    source: scene.id,
    target: scenes[index + 1].id,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#a66b4c', width: 16, height: 16 },
    style: { stroke: '#a66b4c', strokeWidth: 2 },
  })), [scenes]);

  async function finishDrag(id: string, x: number) {
    if (!onReorder || busy || saving) return;
    const from = scenes.findIndex((scene) => scene.id === id);
    const to = Math.max(0, Math.min(scenes.length - 1, Math.round(x / sceneSpacing)));
    if (from < 0 || from === to) {
      setNodes(layoutNodes(scenes, selectedId, shotCounts));
      return;
    }

    const ids = scenes.map((scene) => scene.id);
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    const orderedScenes = ids.map((sceneId) => scenes.find((scene) => scene.id === sceneId)!);
    setNodes(layoutNodes(orderedScenes, selectedId, shotCounts));
    setSaving(true);
    setError(null);
    try {
      await onReorder(ids);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the scene order. Try again.');
      const latest = latestProps.current;
      setNodes(layoutNodes(latest.scenes, latest.selectedId, latest.shotCounts));
    } finally {
      setSaving(false);
    }
  }

  if (scenes.length === 0) {
    return <div className={"scene-flow-empty p-[42px_24px] [border:1px_dashed_#d8cfc2] rounded-[12px] text-muted bg-cream text-center text-[13px]"}>Create your first scene to start the storyboard.</div>;
  }

  return (
    <OpenSceneContext.Provider value={onOpen}>
      <section className={"scene-flow-view overflow-hidden [border:1px_solid_#e7e1da] rounded-[12px] bg-[#fff]"} aria-label="Scene sequence">
        <div className={"scene-flow-heading flex items-start justify-between gap-[20px] p-[24px_28px_22px] [&_h2]:m-0 [&_h2]:text-ink [&_h2]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h2]:text-[26px] [&_h2]:font-normal [&_h2]:tracking-[-.025em] [&_p]:m-[7px_0_0] [&_p]:text-muted [&_p]:text-[12px] [&_p]:leading-[1.5] [&_>_span]:p-[7px_10px] [&_>_span]:rounded-[20px] [&_>_span]:text-[#56624f] [&_>_span]:bg-[#eef1e9] [&_>_span]:text-[11px] [&_>_span]:font-bold [&_>_span]:whitespace-nowrap max-[640px]:flex-col max-[640px]:gap-[12px] max-[640px]:p-[20px]"}>
          <div><h2>Story overview</h2><p>Open a scene to work on its shots.{onReorder ? ' Drag scenes to change their sequence.' : ''}</p></div>
          <span>{scenes.length} {scenes.length === 1 ? 'scene' : 'scenes'}</span>
        </div>
        {error && <div className={"scene-flow-error m-[0_28px_14px] p-[10px_12px] rounded-[6px] text-[#7d2e24] bg-[#f9eae7] text-[12px]"} role="alert">{error}</div>}
        <div className={"scene-flow-canvas h-[410px] bg-[#f8f5ef] [&_.react-flow__pane]:cursor-grab [&_.react-flow__pane:active]:cursor-grabbing [&_.react-flow__node-scene]:w-[270px] [&_.react-flow__node-scene]:rounded-[12px] [&_.react-flow__node-scene:focus-visible]:[outline:3px_solid_#a3573c] [&_.react-flow__node-scene:focus-visible]:[outline-offset:5px] [&_.react-flow__node-scene.selected_.scene-flow-card]:[outline:2px_solid_#53745b] [&_.react-flow__node-scene.selected_.scene-flow-card]:[outline-offset:2px] [&_.react-flow__handle]:w-[8px] [&_.react-flow__handle]:h-[8px] [&_.react-flow__handle]:border-0 [&_.react-flow__handle]:bg-[#a66b4c] [&_.react-flow__controls]:m-[16px] [&_.react-flow__controls]:overflow-hidden [&_.react-flow__controls]:rounded-[7px] [&_.react-flow__controls]:shadow-[0_5px_18px_rgba(40,_35,_27,_.15)] [&_.react-flow__controls-button]:w-[30px] [&_.react-flow__controls-button]:h-[30px] [&_.react-flow__controls-button]:[border-bottom-color:#ece5dc] [&_.react-flow__controls-button]:text-ink [&_.react-flow__controls-button]:bg-[#fff] [&_.react-flow__controls-button:hover]:bg-[#f3eee7] [&_.react-flow__minimap]:overflow-hidden [&_.react-flow__minimap]:[border:1px_solid_#dfd7cc] [&_.react-flow__minimap]:rounded-[6px] max-[640px]:h-[360px] max-[640px]:[&_.react-flow__minimap]:hidden"} aria-label="Scene sequence canvas">
          <ReactFlow<SceneNode, Edge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={(_event, node) => void finishDrag(node.id, node.position.x)}
            nodesDraggable={Boolean(onReorder) && !busy && !saving}
            nodesConnectable={false}
            edgesFocusable={false}
            deleteKeyCode={null}
            zoomOnScroll={false}
            panOnScroll={false}
            panOnDrag
            preventScrolling={false}
            minZoom={0.45}
            maxZoom={1.25}
            fitView
            fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#d7cec1" />
            <Controls showInteractive={false} />
            {scenes.length > 5 && <MiniMap pannable zoomable nodeColor="#a66b4c" maskColor="rgba(247, 245, 241, .7)" />}
          </ReactFlow>
        </div>
        <p className={"scene-flow-hint m-0 p-[12px_28px_16px] text-subtle text-[11px] leading-[1.5] max-[640px]:p-[12px_20px_16px]"}>Drag the canvas to explore. Use the controls to zoom and fit all scenes.</p>
      </section>
    </OpenSceneContext.Provider>
  );
}
