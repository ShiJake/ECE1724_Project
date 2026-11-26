import { FiCameraOff } from "react-icons/fi"

type LogoProps = {
	logoUrl?: string | null;
	logoVersion?: number | null;
	id: number;
	ticker: string;
}

export default function Logo({logoUrl, logoVersion, id, ticker}:LogoProps) {
	return (
		<div className="w-min h-min p-1 rounded-full border-2 border-cyan-900 bg-cyan-800 text-white flex items-center justify-center shrink-0">
			{logoUrl ? (
				<img
					src={logoVersion?`/api/watches/${id}/logo?v=${logoVersion}` : `/api/watches/${id}/logo`}
					alt={`${ticker} logo`}
					className="w-10 h-10 rounded-full object-cover bg-white shrink-0"
				/>
			) : (
				<FiCameraOff className="w-6 h-6 m-1"/>
			)}
		</div>
	);
}
