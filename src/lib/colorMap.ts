export const colorOptions = [
  { name: "indigo", bg: "bg-indigo-500", text: "text-indigo-50", soft: "bg-indigo-100 text-indigo-700", ring: "ring-indigo-500" },
  { name: "violet", bg: "bg-violet-500", text: "text-violet-50", soft: "bg-violet-100 text-violet-700", ring: "ring-violet-500" },
  { name: "purple", bg: "bg-purple-500", text: "text-purple-50", soft: "bg-purple-100 text-purple-700", ring: "ring-purple-500" },
  { name: "pink", bg: "bg-pink-500", text: "text-pink-50", soft: "bg-pink-100 text-pink-700", ring: "ring-pink-500" },
  { name: "rose", bg: "bg-rose-500", text: "text-rose-50", soft: "bg-rose-100 text-rose-700", ring: "ring-rose-500" },
  { name: "orange", bg: "bg-orange-500", text: "text-orange-50", soft: "bg-orange-100 text-orange-700", ring: "ring-orange-500" },
  { name: "amber", bg: "bg-amber-500", text: "text-amber-50", soft: "bg-amber-100 text-amber-700", ring: "ring-amber-500" },
  { name: "emerald", bg: "bg-emerald-500", text: "text-emerald-50", soft: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-500" },
  { name: "teal", bg: "bg-teal-500", text: "text-teal-50", soft: "bg-teal-100 text-teal-700", ring: "ring-teal-500" },
  { name: "cyan", bg: "bg-cyan-500", text: "text-cyan-50", soft: "bg-cyan-100 text-cyan-700", ring: "ring-cyan-500" },
  { name: "blue", bg: "bg-blue-500", text: "text-blue-50", soft: "bg-blue-100 text-blue-700", ring: "ring-blue-500" },
];

export const getColor = (name: string) =>
  colorOptions.find((c) => c.name === name) ?? colorOptions[0];
