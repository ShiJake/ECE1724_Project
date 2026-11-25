// For GET API
export type User = {
	id: string;
	email: string;
	password: string;
}

export type Watch = {
	id: number;
	ticker: string;
	purchasePrice: number;
	gainPct: number;
	lossPct: number;
	logoUrl?: string | null;
	gainNotified: boolean;
	lossNotified: boolean;
	createdAt: string;	// Dates as ISO Strings
	updatedAt: string;
	currentPrice: number;
	priceUpdatedAt: string;
	changeAmount: number;
	changePct: number;
}

// For use with price history
export type priceData = {
	date: string;
	price: number;
}

// For Frontend Form States
export type LoginFormData = {
	username: string;
	email: string;
	password: string;
	confirmPass: string;
}

export type WatchFormData = {
	ticker: string;
	purchasePrice: string;
	gainPct: string;
	lossPct: string;
}

// For sending to Backend API
export type WatchPayload = {
	ticker: string;
	purchasePrice: number;
	gainPct: number;
	lossPct: number;
}
