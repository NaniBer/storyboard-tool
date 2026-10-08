import { tw } from './tailwind-classes';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import { imageUrl, type Shot } from './api';

const spacing = 326;
const EditContext = createContext<(id: string) => void>(() => undefined);

type ShotNode = Node<{ shot: Shot; number: number }, 'shot'>;

function layoutNodes(shots: Shot[], selectedShotId: string | null): ShotNode[] {
  return shots.map((shot, index) => ({
    id: shot.id,
    type: 'shot',
    position: { x: index * spacing, y: index % 2 === 0 ? 0 : 28 },
    data: { shot, number: index + 1 },
    draggable: true,
    selected: shot.id === selectedShotId,
    ariaLabel: `Shot ${index + 1}: ${shot.shotType || 'Untitled shot'}, ${shot.status}. Select to edit.`,
  }));
}

function ShotNodeCard({ data }: NodeProps<ShotNode>) {
  const { shot, number } = data;
  const onEdit = useContext(EditContext);
  const previewPath = shot.image?.previewUrl ?? shot.image?.previousPreviewUrl;

  return (
    <div className={"flow-shot relative overflow-hidden w-[260px] rounded-[13px] bg-[#fff] shadow-[0_15px_32px_-20px_rgba(41,_37,_30,_.36)] [transition:box-shadow_.24s_ease,_transform_.24s_cubic-bezier(.2,_.8,_.2,_1)] [&:hover]:[transform:translateY(-3px)] [&:hover]:shadow-[0_23px_39px_-23px_rgba(41,_37,_30,_.4)] [.react-flow__node.dragging_&]:[transform:rotate(-1deg)] [.react-flow__node.dragging_&]:shadow-[0_25px_43px_-20px_rgba(41,_37,_30,_.42)]"} aria-label={`Shot ${number}: ${shot.shotType || 'Untitled shot'}`}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className={"flow-shot-image relative grid place-items-center aspect-video overflow-hidden text-[#736b62] bg-[#ebe5db] [font-family:Georgia,_'Times_New_Roman',_serif] text-[14px] italic [&_img]:block [&_img]:w-full [&_img]:h-full [&_img]:object-contain"}>
        {previewPath ? <img src={imageUrl(previewPath)} alt="" /> : <span>No image yet</span>}
        <span className={"flow-shot-number absolute [left:13px] [bottom:12px] grid place-items-center min-w-[34px] h-[29px] p-[0_6px] rounded-[5px] text-[#fff] bg-ink [font-family:-apple-system,_BlinkMacSystemFont,_'Segoe_UI',_sans-serif] text-[11px] not-italic font-bold tabular-nums"}>{String(number).padStart(2, '0')}</span>
      </div>
      <div className={"flow-shot-content p-[18px_18px_16px] [&_>_p]:[display:-webkit-box] [&_>_p]:min-h-[39px] [&_>_p]:m-[11px_0_15px] [&_>_p]:overflow-hidden [&_>_p]:text-[#5e584f] [&_>_p]:text-[12px] [&_>_p]:leading-[1.6] [&_>_p]:[-webkit-box-orient:vertical] [&_>_p]:[-webkit-line-clamp:2]"}>
        <div className={"flow-shot-title flex items-start justify-between gap-[9px] [&_h3]:min-w-0 [&_h3]:m-0 [&_h3]:text-ink [&_h3]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h3]:text-[19px] [&_h3]:font-normal [&_h3]:leading-[1.25] [&_h3]:[overflow-wrap:anywhere] [&_.shot-status]:p-[5px_7px] [&_.shot-status]:text-[10px]"}><h3>{shot.shotType || 'Untitled shot'}</h3><span className={tw(`shot-status ${shot.status}`)}>{shot.status}</span></div>
        <p>{shot.description || 'Add a description to give this frame its story.'}</p>
        <button className={"flow-shot-edit inline-flex items-center gap-[7px] p-[6px_0] border-0 text-[#925036] [background:none] text-[11px] font-bold [&:hover]:text-[#603a28] [&:hover]:underline [&:hover]:[text-underline-offset:3px] [&_svg]:w-[15px] [&_svg]:h-[15px] nodrag"} type="button" onClick={() => onEdit(shot.id)}>Edit shot <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

const nodeTypes = { shot: ShotNodeCard };

export default function ShotFlow({ shots, busy, selectedShotId, onReorder, onEdit }: {
  shots: Shot[];
  busy: boolean;
  selectedShotId: string | null;
  onReorder: (ids: string[]) => Promise<void>;
  onEdit: (id: string) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<ShotNode>(layoutNodes(shots, selectedShotId));
  const [error, setError] = useState<string | null>(null);
  const flowRef = useRef<ReactFlowInstance<ShotNode, Edge> | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setNodes(layoutNodes(shots, selectedShotId)); }, [shots, selectedShotId, setNodes]);

  useEffect(() => {
    if (shots.length > 4 || !canvasRef.current) return;
    let frame = 0;
    const fit = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => { void flowRef.current?.fitView({ padding: 0.12, maxZoom: 1, duration: 250 }); });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(canvasRef.current);
    fit();
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); };
  }, [shots.length]);

  const edges: Edge[] = shots.slice(0, -1).map((shot, index) => ({
    id: `${shot.id}-${shots[index + 1].id}`,
    source: shot.id,
    target: shots[index + 1].id,
    type: 'smoothstep',
    pathOptions: { borderRadius: 34, offset: 34 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#a66b4c', width: 16, height: 16 },
    style: { stroke: '#a66b4c', strokeWidth: 2 },
  }));

  async function finishDrag(id: string, x: number) {
    const from = shots.findIndex((shot) => shot.id === id);
    const to = Math.max(0, Math.min(shots.length - 1, Math.round(x / spacing)));
    if (busy || from < 0 || from === to) {
      setNodes(layoutNodes(shots, selectedShotId));
      return;
    }
    const order = shots.map((shot) => shot.id);
    order.splice(from, 1);
    order.splice(to, 0, id);
    setError(null);
    try {
      await onReorder(order);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the new shot order. Try again.');
      setNodes(layoutNodes(shots, selectedShotId));
    }
  }

  return (
    <EditContext.Provider value={onEdit}>
      <div className={"flow-view overflow-hidden rounded-[14px] bg-[#f0ebe3] [animation:flow-arrive_.52s_cubic-bezier(.16,_1,_.3,_1)_both]"}>
        <div className={"flow-view-top flex items-center justify-between gap-[24px] p-[22px_26px_19px] [&_h3]:m-0 [&_h3]:text-ink [&_h3]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h3]:text-[23px] [&_h3]:font-normal [&_h3]:tracking-[-.02em] [&_p]:m-[5px_0_0] [&_p]:text-[#5e584f] [&_p]:text-[12px] [&_p]:leading-[1.5] max-[760px]:items-start max-[760px]:flex-col max-[760px]:gap-[8px] max-[520px]:p-[19px_18px_16px]"}><div><h3>Scene canvas</h3><p>Choose a frame to edit. Drag it left or right to change the order.</p></div><div className="flex flex-none items-center gap-3"><span className="text-[11px] font-bold tabular-nums text-[#82664f]">{shots.length} {shots.length === 1 ? 'frame' : 'frames'} in sequence</span><button type="button" className="rounded-[5px] border border-[#c8b9a8] px-[9px] py-[6px] text-[11px] font-bold text-ink hover:bg-white" onClick={() => { void flowRef.current?.fitView({ padding: 0.12, maxZoom: 1, duration: 250 }); }}>Show all frames</button></div></div>
        {error && <div className={"notice mt-[23px] p-[12px_14px] rounded-[6px] text-[12px] leading-[1.5] [&.error]:text-[#7d2e24] [&.error]:bg-[#f9eae7] error flow-error m-[0_26px_16px]"} role="alert">{error}</div>}
        <div ref={canvasRef} className={"flow-canvas h-[440px] bg-[#f8f5ef] [&_.react-flow__pane]:cursor-grab [&_.react-flow__pane:active]:cursor-grabbing [&_.react-flow__node-shot]:w-[260px] [&_.react-flow__node-shot]:rounded-[13px] [&_.react-flow__node-shot:focus-visible]:[outline:3px_solid_#b46346] [&_.react-flow__node-shot:focus-visible]:[outline-offset:5px] [&_.react-flow__handle]:w-[8px] [&_.react-flow__handle]:h-[8px] [&_.react-flow__handle]:border-0 [&_.react-flow__handle]:bg-[#a66b4c] [&_.react-flow__controls]:m-[16px] [&_.react-flow__controls]:overflow-hidden [&_.react-flow__controls]:rounded-[7px] [&_.react-flow__controls]:shadow-[0_5px_18px_rgba(40,_35,_27,_.15)] [&_.react-flow__controls-button]:w-[30px] [&_.react-flow__controls-button]:h-[30px] [&_.react-flow__controls-button]:[border-bottom-color:#ece5dc] [&_.react-flow__controls-button]:text-ink [&_.react-flow__controls-button]:bg-[#fff] [&_.react-flow__controls-button:hover]:bg-[#f3eee7] max-[760px]:h-[400px]"} aria-label="Shot sequence canvas">
          <ReactFlow<ShotNode, Edge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={(instance) => { flowRef.current = instance; if (shots.length <= 4) void instance.fitView({ padding: 0.12, maxZoom: 1 }); }}
            onNodesChange={onNodesChange}
            onNodeClick={(_event, node) => onEdit(node.id)}
            onNodeDragStop={(_event, node) => void finishDrag(node.id, node.position.x)}
            nodesDraggable={!busy}
            nodesConnectable={false}
            edgesFocusable={false}
            deleteKeyCode={null}
            zoomOnScroll={false}
            panOnScroll={false}
            panOnDrag
            preventScrolling={false}
            minZoom={0.45}
            maxZoom={1.25}
            defaultViewport={{ x: 38, y: 70, zoom: 1 }}
            fitView={shots.length <= 4}
            fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#d7cec1" />
            <Controls showInteractive={false} />
            {shots.length > 6 && <MiniMap pannable zoomable nodeColor={(node) => node.id === selectedShotId ? '#a3573c' : '#536858'} />}
            <Panel position="top-left" className={"flow-panel"}>{selectedShotId ? `Editing frame ${shots.findIndex((shot) => shot.id === selectedShotId) + 1}` : 'Select a frame'}</Panel>
          </ReactFlow>
        </div>
        <p className={"flow-view-hint m-0 p-[13px_26px_16px] text-[#635a50] text-[11px] leading-[1.5] max-[520px]:p-[12px_18px_15px]"}>Drag the empty canvas to explore. Use the controls to fit all frames. The sequence here determines the export order.</p>
      </div>
    </EditContext.Provider>
  );
}
