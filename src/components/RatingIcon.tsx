import { Heart, Smile, ThumbsDown } from 'lucide-react';
import type { Rating } from '../types';

const ICONS = { again: Heart, okay: Smile, nope: ThumbsDown } as const;

export function RatingIcon({ rating, className = 'size-4' }: { rating: Rating; className?: string }) {
  const Icon = ICONS[rating];
  return <Icon className={className} aria-hidden />;
}
