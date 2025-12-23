import { Sidebar } from "@/components/dashboard/sidebar";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { GlassCard } from "@/components/ui/glass-card";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { name: 'Mon', messages: 400 },
  { name: 'Tue', messages: 300 },
  { name: 'Wed', messages: 550 },
  { name: 'Thu', messages: 450 },
  { name: 'Fri', messages: 600 },
  { name: 'Sat', messages: 200 },
  { name: 'Sun', messages: 150 },
];

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pl-64 p-8">
        <div className="max-w-7xl mx-auto">
          <header className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
              <p className="text-muted-foreground">Welcome back, Alex!</p>
            </div>
          </header>

          <StatsCards />

          <div className="grid lg:grid-cols-3 gap-8">
            <GlassCard className="col-span-2 p-6 min-h-[400px]">
              <h3 className="text-lg font-semibold mb-6">Conversation Volume</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data}>
                    <defs>
                      <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" stroke="#525252" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#525252" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Area type="monotone" dataKey="messages" stroke="#8B5CF6" strokeWidth={3} fillOpacity={1} fill="url(#colorMessages)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold mb-6">Recent Activity</h3>
              <div className="space-y-6">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex gap-4 items-start">
                    <div className="h-2 w-2 mt-2 rounded-full bg-secondary shrink-0" />
                    <div>
                      <p className="text-sm">New conversation started on Pricing Page</p>
                      <span className="text-xs text-muted-foreground">2 mins ago</span>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      </main>
    </div>
  );
}
