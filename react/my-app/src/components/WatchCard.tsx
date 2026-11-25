import { FiAlertCircle } from "react-icons/fi";
import {Button} from "./ui/button";
import { alertIconClass, clickableText, tickerClass } from "../lib/ui";
import ChangePctLabel from "./ChangePctLabel";

type WatchCardProps = {
	id: number;
	ticker: string;
	logoUrl?: string | null;
	triggered: boolean;
	changePct: number | null;	// null until the backend has a price for the stock
	locked: boolean;
	onView: (id: number) => void;
	onDelete: (id: number, ticker:string) => void;
};

export default function WatchCard({
	id,
	ticker,
	logoUrl,
	triggered,
	changePct,
	locked,
	onView,
	onDelete,
}: WatchCardProps) {
	return (
		<div className="flex justify-between md:w-2/3 w-full p-3 border-4 rounded-3xl border-cyan-900 bg-blue-300">
			{/* Stack ticker+alert  above view details link*/}
			<div className="flex items-center space-x-3">
				{logoUrl ? (
					<img
						src={`/api/watches/${id}/logo`}
						alt={`${ticker} logo`}
						className="w-10 h-10 rounded-full object-cover border-2 border-cyan-900 bg-white shrink-0"
					/>
				) : (
					<div className="w-10 h-10 rounded-full border-2 border-cyan-900 bg-cyan-800 text-white font-bold flex items-center justify-center shrink-0">
						{ticker.slice(0, 2).toUpperCase()}
					</div>
				)}
				<div className="flex-col">
				{/* Pack ticker and alert icon together */}
				<div className="flex justify-center">
						<p className={tickerClass}>{ticker}</p>
						{triggered && <FiAlertCircle className={alertIconClass} />}
					</div>
					{/*View Details link*/}
					<button
						type="button"
						disabled={locked}
						onClick={() => onView(id)}
						className={clickableText}
					>
						View Details
					</button>
				</div>
			</div>
			{/*If price updates exist, show Change Pct Label in the middle. Else, (ie. new watch) display a div with N/A */}
			{changePct != null ? (
				<ChangePctLabel pct={changePct} />
			) : (
				<div className="w-min h-min px-3 self-center border-2 rounded-full font-bold text-xl text-gray-400 bg-cyan-800 border-cyan-900">
					N/A
				</div>
			)}
			{/*Delete Button*/}
			<Button
				type="button"
				disabled={locked}
				onClick={() => {
					onDelete(id, ticker);
				}}
				className="w-7 h-7 border-2 text-white bg-red-700 hover:text-red-400 hover:bg-cyan-950 hover:border-red-600"
			>
				X
			</Button>
		</div>
	);
}
