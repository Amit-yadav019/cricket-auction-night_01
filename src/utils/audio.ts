import { sound } from '../services/soundService';

export const playBidChime = (bidAmount?: number) => sound.playBid(bidAmount);
export const playGavelHit = () => sound.playSold();
export const playUnsoldChime = () => sound.playUnsold();
export const playUndoSound = () => sound.playUndo();
export const playOutbidSound = () => sound.playOutbid();
export const playWarningSound = () => sound.playWarning();
export const playFanfareSound = () => sound.playFanfare();
export const speakAuctioneer = (text: string) => sound.speakCommentary(text);
