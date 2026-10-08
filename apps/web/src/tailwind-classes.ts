// Generated Tailwind utilities for composed state classes. Static class names live in components.
const classes: Record<string, string> =  {
  "overview-link": "flex items-center justify-between w-full mt-[17px] p-[11px_13px] border-0 rounded-[7px] text-[#d8dcd5] bg-transparent text-left text-[12px] font-bold [&:hover]:text-[#fff] [&:hover]:bg-[#3c433e] [&.selected]:text-[#fff] [&.selected]:bg-[#3c433e] [&_svg]:w-[16px] [&_svg]:h-[16px] max-[760px]:hidden",
  "scene-link": "flex flex-col gap-[6px] w-full p-[13px_13px_12px] border-0 rounded-[7px] bg-transparent text-[#e8e7e1] text-left [transition:background_.18s_ease] [&:hover]:bg-[#343a36] [&.selected]:bg-[#3c433e] max-[760px]:[flex:0_0_180px]",
  "shot-status": "flex-none p-[7px_10px] rounded-[50px] text-[11px] font-bold capitalize [&.draft]:text-[#77664b] [&.draft]:bg-[#f4eee3] [&.approved]:text-[#406c4d] [&.approved]:bg-[#eff4ed]",
  "secondary-button": "p-[10px_16px] [border:1px_solid_#293c32] rounded-[6px] text-ink bg-transparent text-[12px] font-bold [&:hover]:bg-[#ecf0eb]",
  "image-upload-button": "relative inline-flex items-center justify-center min-h-[37px] cursor-pointer [&_input]:absolute [&_input]:[inset:0] [&_input]:w-full [&_input]:h-full [&_input]:opacity-[0] [&_input]:cursor-pointer [&:focus-within]:[outline:3px_solid_#b46346] [&:focus-within]:[outline-offset:3px] [&.disabled]:opacity-[.55] [&.disabled]:cursor-not-allowed [&_input:disabled]:cursor-not-allowed"
};

export function tw(value: string | null | undefined): string {
  return (value ?? '').split(/\s+/).filter(Boolean).flatMap((name) => [name, classes[name] ?? '']).join(' ');
}
