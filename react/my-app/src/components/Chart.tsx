"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
	CardTitle,
  CardFooter
} from "./ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "./ui/chart"
import { Button } from "./ui/button"
import { buttonClass } from "../lib/ui"

const chartConfig = {
  desktop: {
    label: "Desktop",
    color: "#3b82f6",
  },
} satisfies ChartConfig

type ChartProps = {
	data: { date: string, price: number }[];
	gainThresh: number;
	lossThresh: number;
	handleDownload: () => void;
}

export function Chart({ data, gainThresh, lossThresh, handleDownload }: ChartProps) {
  return (
    <Card className="w-5/6 bg-gray-800 text-gray-300">
      <CardHeader>
        <CardTitle className="font-bold text-3xl">Price History Data</CardTitle>
        <CardDescription className="text-lg text-gray-400">{`${data[0].date} - ${data.at(-1).date}`}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-3/1">
					<LineChart
						responsive
						height={100}
            accessibilityLayer
						data={data.map((entry) => ({ ...entry, gain: gainThresh, loss: lossThresh }))}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid/>
            <XAxis
              dataKey="date"
              tickLine={true}
              axisLine={true}
							tickMargin={8}
							tickFormatter={(value) => value.slice(0, -6)}
						/>
						<YAxis
							domain={['auto', 'auto']}
						/>
            <ChartTooltip
              cursor={true}
              content={<ChartTooltipContent/>}
            />
            <Line
              dataKey="price"
              type="linear"
              stroke="var(--color-desktop)"
              strokeWidth={4}
              dot={false}
            />
            <Line
              dataKey="gain"
              type="linear"
              stroke="#22c55e"
              strokeWidth={4}
              dot={false}
            />
            <Line
              dataKey="loss"
              type="linear"
              stroke="#dc2626"
              strokeWidth={4}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex justify-center">
				<Button type='button' onClick={handleDownload} className={buttonClass}>Download Price History</Button>
      </CardFooter>
		</Card>

  )
}
