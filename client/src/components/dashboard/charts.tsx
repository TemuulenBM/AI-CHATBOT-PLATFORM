import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface MessageVolumeChartProps {
  data: Array<{ name: string; date: string; messages: number }>;
}

export function MessageVolumeChart({ data }: MessageVolumeChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="name"
          stroke="#525252"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="#525252"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1e293b",
            borderColor: "#334155",
            borderRadius: "8px",
          }}
          itemStyle={{ color: "#fff" }}
          labelFormatter={(label, payload) => {
            if (payload && payload[0]?.payload?.date) {
              return new Date(payload[0].payload.date).toLocaleDateString(
                "en-US",
                {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                }
              );
            }
            return label;
          }}
        />
        <Area
          type="monotone"
          dataKey="messages"
          stroke="#8B5CF6"
          strokeWidth={3}
          fillOpacity={1}
          fill="url(#colorMessages)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface SentimentPieChartProps {
  data: {
    positive: number;
    neutral: number;
    negative: number;
    total: number;
    positiveRate: number;
    negativeRate: number;
  };
}

export function SentimentPieChart({ data }: SentimentPieChartProps) {
  const chartData = [
    { name: "Positive", value: data.positive },
    { name: "Neutral", value: data.neutral },
    { name: "Negative", value: data.negative },
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          paddingAngle={5}
          dataKey="value"
        >
          <Cell fill="#4ade80" />
          <Cell fill="#94a3b8" />
          <Cell fill="#f87171" />
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "#1e293b",
            borderColor: "#334155",
            borderRadius: "8px",
          }}
          itemStyle={{ color: "#fff" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
