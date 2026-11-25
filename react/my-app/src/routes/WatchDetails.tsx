import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { type priceData, type Watch, type WatchPayload} from "../types";
import WatchForm from "../components/WatchForm";
import {
	pageContainerClass,
	msgClass,
	errorMsgClass,
	h2Class,
	tickerClass,
	tableClass,
	tableHeaderClass,
	tableEntryClass,
	buttonClass,
	errStatusMsgClass,
	statusMsgClass,
} from "../lib/ui";
import ChangePctLabel from "../components/ChangePctLabel";
import Banner from "../components/Banner";
import { Button } from "../components/ui/button";
import AlertLabel from "../components/AlertLabel";
import { Switch } from "../components/ui/switch";
import { Chart } from "../components/Chart";
import { authClient } from "../lib/auth-client";

// This will all be fetched from backend using Watch id number passed in as route param
const empty_watch: Watch = {
	id: -1,
	ticker: "XYZ",
	logoUrl: null,
	purchasePrice: 0,
	gainPct:0,
	lossPct:0,
	gainNotified: false,
	lossNotified: false,
	createdAt: "",
	updatedAt: "",
	currentPrice: 0,
	priceUpdatedAt: "",
	changeAmount: 0,
	changePct: 0,
};

export default function WatchDetails() {
	const params = useParams();
	const navigate = useNavigate();

	const { data: session, isPending } = authClient.useSession();

	useEffect(() => {
		if (!isPending && !session) {
			navigate("/");
		}
	}, [isPending, session, navigate]);

	const [watch, setWatch] = useState(empty_watch);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState(false);
	const [statusMsg, setStatusMsg] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);	// used when updating alert display
	const [uploadingLogo, setUploadingLogo] = useState(false);
	const [logoVersion, setLogoVersion] = useState(0);
	const [locked, setLocked] = useState(false);					// used for race conditions
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const [priceData, setPriceData] = useState<priceData[]>([]);				// for price history chart
	const [loadingHist, setLoadingHist] = useState(true);
	const [histError, setHistError] = useState(false);

	// Load watch and price history data on page refresh
	useEffect(() => {
		async function loadWatch() {
			if (isPending) return;

			if (!session) {
				setLoading(false);
				return;
			}

			try {
				const response = await fetch(`/api/watches/${params.watchid}`);

				if (!response.ok) {
					throw new Error("Error loading watch");
				}

				const data = await response.json();
				setWatch(data);
			} catch {
				setLoadError(true);
			} finally {
				setLoading(false);
			}
		}

		async function loadPriceHist() {
			try {
				const response = await fetch(`/api/watches/${params.watchid}/prices.csv`);

				if (!response.ok) {
					throw new Error("Error loading price history data");
				}
				// Convert the csv string into an array of JSON objects
				const data = await response.text();
				setPriceData(data.split('\n').slice(1, -1).map((row) => ({ date: new Date(row.split(',')[0]).toLocaleString(), price: Number(row.split(',')[1]) })));
			} catch {
				setHistError(true);
			} finally {
				setLoadingHist(false);
			}
		}

		loadPriceHist();
		loadWatch();
	}, [params.watchid, isPending, session]);

	// Live update watch every 10 seconds
	useEffect(() => {
		if (isPending || !session) return;
		async function loadWatch() {
			if (locked) return;
			try {
				setLocked(true);
				const response = await fetch(`/api/watches/${params.watchid}`);

				if (!response.ok) {
					throw new Error("Error loading watches");
				}
				const data = await response.json();
				setWatch(data);
			} catch {
				setStatusMsg("Error updating watch");
			} finally {
				setLocked(false);
			}
		}

		const intervalId = setInterval(() => {
			loadWatch();
		}, 10000);
		return () => {
			clearInterval(intervalId);
		};
	}, [params.watchid, watch, locked, isPending, session]);

	//Update Watch submission handler
	async function handleSubmit(payload: WatchPayload) {
		if (locked) return;
		try {
			setSubmitting(true);
			setLocked(true);
			const response = await fetch(`/api/watches/${params.watchid}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				throw new Error("Error updating watch");
			}

			const data = await response.json();
			setWatch(data);
			setStatusMsg("Updated Watch");
		} catch {
			setStatusMsg("Error updating watch");
		} finally {
			setSubmitting(false);
			setLocked(false);
		}
	}

	// Reset Notif handler
	async function handleNotifReset() {
		//If submitting is true, the notifs will be reset by the other submission process
		if (locked) return;
		// Send a copy of the watch as a WatchPayload to trigger alert reset
		const payload: WatchPayload = {
			ticker: watch.ticker,
			purchasePrice: watch.purchasePrice,
			gainPct: watch.gainPct,
			lossPct: watch.lossPct,
		};

		try {
			setSubmitting(true);
			setLocked(true);
			const response = await fetch(`/api/watches/${params.watchid}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!response.ok) {
				throw new Error("Error resetting alerts");
			}
			const data = await response.json();
			setWatch(data);
			setStatusMsg("Alerts Reset Successfully");

		} catch {
			setStatusMsg("Error resetting alerts");
		} finally {
			setSubmitting(false);
			setLocked(false);
    	}
	}

	async function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file || locked || uploadingLogo) return;

		const formData = new FormData();
		formData.append("logo", file);

		try {
			setUploadingLogo(true);
			setLocked(true);
			const response = await fetch(`/api/watches/${params.watchid}/logo`, {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				throw new Error("Error uploading logo");
			}

			const data = await response.json();
			setWatch((prev) => ({
				...prev,
				...data,
				logoUrl: data.logoUrl ?? prev.logoUrl,
			}));
			setLogoVersion((prev) => prev + 1);
			setStatusMsg("Uploaded Logo");
		} catch {
			setStatusMsg("Error uploading logo");
		} finally {
			setUploadingLogo(false);
			setLocked(false);
		}
	}


	// Handle price csv download
	async function handleDownload() {
		try {
			const response = await fetch(`/api/watches/${params.watchid}/prices.csv`);
			if (!response.ok) {
				throw new Error("Error downloading portfolio");
			}
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `${watch.ticker}_price_history.csv`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
			setStatusMsg("Downloaded price history CSV");
		} catch {
			setStatusMsg("Error downloading price history");
		}
	}

	return (
		<div className={pageContainerClass}>
			<Banner/>
			<div className="w-full p-3 border-4 rounded-3xl bg-gray-400 border-cyan-950">
				{/*Non-Dismissable status/error messages*/}
				{loading ? (
					<div className={msgClass}>Loading StockWatch...</div>
				) : loadError ? (
					<div className={errorMsgClass}>Error Loading StockWatch</div>
				) : (
					<div className="flex-col justify-items-center space-y-10 mb-2">
						{/*Pack ticker and subheader in a div as seperate elements so ticker can be styled seperately*/}
						<div className="flex flex-wrap items-center justify-center gap-3">
							{watch.logoUrl ? (
								<img
									src={`/api/watches/${watch.id}/logo?v=${logoVersion}`}
									alt={`${watch.ticker} logo`}
									className="w-12 h-12 rounded-full object-cover border-2 border-cyan-900 bg-white shrink-0"
								/>
							) : (
								<div className="w-12 h-12 rounded-full border-2 border-cyan-900 bg-cyan-800 text-white font-bold flex items-center justify-center shrink-0">
									{watch.ticker.slice(0, 2).toUpperCase()}
								</div>
							)}
							<p className={`${tickerClass} lg:text-3xl text-2xl`}>{watch.ticker}</p>
							<p className={h2Class}>Stock Watch Summary</p>
							<input
								ref={fileInputRef}
								type="file"
								accept="image/png,image/jpeg,image/webp,image/svg+xml"
								onChange={handleLogoChange}
								className="hidden"
							/>
							<Button
								type="button"
								disabled={locked || uploadingLogo}
								onClick={() => fileInputRef.current?.click()}
								className={buttonClass}
							>
								{uploadingLogo ? "Uploading..." : "Upload Logo"}
							</Button>
						</div>
						<div>
							{/*Dismissable status/error messages*/}
							{statusMsg && (
								<Button
									type="button"
									onClick={() => setStatusMsg(null)}
									className={`mb-3 p-2 border-2 rounded-full bg-gray-200 border-cyan-800 ${statusMsg.includes("Error") ? errStatusMsgClass : statusMsgClass}`}
								>
									{statusMsg}
								</Button>
							)}
							<table className={tableClass}>
								<tr>
									<th className={tableHeaderClass}>Purchased Price</th>
									<th className={tableHeaderClass}>Current Price</th>
									<th className={tableHeaderClass}>% Change from Purchased</th>
									<th className={tableHeaderClass}>Last Updated</th>
									<th className={tableHeaderClass}>Gain Alert Status</th>
									<th className={tableHeaderClass}>Loss Alert Status</th>
									<th className={tableHeaderClass}>Reset Alerts</th>
								</tr>
								<tr>
									<td className={tableEntryClass}>{`$${watch.purchasePrice}`}</td>
									<td className={tableEntryClass}>{!watch.currentPrice ? "N/A" : `$${watch.currentPrice}`}</td>
									<td className={tableEntryClass}>{!watch.currentPrice ? "N/A" : <ChangePctLabel pct={watch.changePct} />}</td>
									<td className={tableEntryClass}>{!watch.currentPrice ? "N/A" : new Date(watch.priceUpdatedAt).toLocaleTimeString()}</td>
											<td className={tableEntryClass}><AlertLabel alert={watch.gainNotified} resetting={submitting} /></td>
											<td className={tableEntryClass}><AlertLabel alert={watch.lossNotified} resetting={submitting} /></td>
									<td className={tableEntryClass}>
										{/*Reset Alerts switch*/}
										<Switch
											disabled={submitting || (!watch.gainNotified && !watch.lossNotified)}
											checked={!watch.gainNotified && !watch.lossNotified}
											onCheckedChange={()=>handleNotifReset()}
											className={`border-3 ${watch.gainNotified || watch.lossNotified ? "border-amber-500 hover:shadow-md hover:shadow-yellow-600" : ""}`}
										/>
									</td>
								</tr>
							</table>
						</div>
						{/*Dismissable status/error messages*/}
						{statusMsg && <Button
							type='button'
							onClick={() => setStatusMsg(null)}
							className={`mb-3 p-2 border-2 rounded-full bg-gray-200  border-cyan-800 ${statusMsg.includes('Error') ? errStatusMsgClass : statusMsgClass}`}
						>{statusMsg}</Button>}
						{/*price history chart*/}
						{loadingHist ? <div className={msgClass}>Loading Price History...</div>
							: histError ? <div className={errorMsgClass}>Error Loading Price History</div>
							: priceData.length < 2? <div className={msgClass}>Not Enough Data to Generate Price History</div>
							: <Chart data={priceData} gainThresh={watch.purchasePrice * (1 + watch.gainPct / 100)} lossThresh={watch.purchasePrice * (1 + watch.lossPct / 100)} handleDownload={handleDownload} />
						}
						<WatchForm
							watch={{
								ticker: watch.ticker,
								purchasePrice: watch.purchasePrice.toString(),
								gainPct: watch.gainPct.toString(),
								// The API stores the loss threshold as 0 or negative, but the form takes a positive number
								lossPct: Math.abs(watch.lossPct).toString()
							}}
							locked={locked}
						onSubmit={handleSubmit} />
					</div>
				)}
				<Button type='button' onClick={() => navigate(`/users/${params.userid}`)} className={buttonClass}>Back</Button>
			</div>
		</div>
	);
}
