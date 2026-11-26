import { FiCameraOff } from "react-icons/fi"

type LogoProps = {
	logoUrl?: string | null;
	id: number;
	ticker: string;
}

export default function Logo({logoUrl, id, ticker}:LogoProps) {
	return (
		<div className="w-10 h-10 rounded-full border-2 border-cyan-900 bg-cyan-800 text-white font-bold flex items-center justify-center shrink-0">
			{logoUrl ? (
				<img
					src={`/api/watches/${id}/logo`}
					alt={`${ticker} logo`}
					className="w-10 h-10 rounded-full object-cover border-2 border-cyan-900 bg-white shrink-0"
				/>
			) : (
				<FiCameraOff />
			)}
		</div>
	);
}
