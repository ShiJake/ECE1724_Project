import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { Watch, WatchPayload} from "../types";
import WatchForm from "../components/WatchForm";
import { pageContainerClass, msgClass, errorMsgClass, h2Class, tickerClass, tableClass, tableHeaderClass, tableEntryClass, buttonClass, errStatusMsgClass, statusMsgClass } from "../lib/ui";
import ChangePctLabel from "../components/ChangePctLabel";
import Banner from "../components/Banner";
import { Button } from "../components/ui/button";
import AlertLabel from "../components/AlertLabel";
import { Switch } from "../components/ui/switch";
import { authClient } from "../lib/auth-client";

// This will all be fetched from backend using Watch id number passed in as route param
const empty_watch: Watch = {
	id: -1,
	ticker: "XYZ",
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
	changePct: 0
}

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
	const [locked, setLocked] = useState(false);					// used for race conditions

	// Load watch on page refresh
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
		}
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
			})

			if (!response.ok) {
				throw new Error("Error updating watch");
			}

			const data = await response.json()
			setWatch(data);
			setStatusMsg("Updated Watch")
		} catch {
			setStatusMsg("Error updating watch")
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
		const payload: WatchPayload = { ticker: watch.ticker, purchasePrice: watch.purchasePrice, gainPct: watch.gainPct, lossPct: watch.lossPct };

		try {
			setSubmitting(true);
			setLocked(true);
			const response = await fetch(`/api/watches/${params.watchid}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			})
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
						<div className="flex space-x-2">
							<p className={`${tickerClass} lg:text-3xl text-2xl`}>{watch.ticker}</p>
							<p className={h2Class}>Stock Watch Summary</p>
						</div>
						<div>
							{/*Dismissable status/error messages*/}
							{statusMsg && <Button
								type='button'
								onClick={() => setStatusMsg(null)}
								className={`mb-3 p-2 border-2 rounded-full bg-gray-200  border-cyan-800 ${statusMsg.includes('Error') ? errStatusMsgClass : statusMsgClass}`}
							>
								{statusMsg}
							</Button>}
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
											className={`border-3 ${watch.gainNotified || watch.lossNotified ? 'border-amber-500 hover:shadow-md hover:shadow-yellow-600': ''}`}
										/>
									</td>
								</tr>
							</table>
						</div>
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
