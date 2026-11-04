import { createContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { navidromeClient, navidromeKeys } from "./data/navidrome";
import type { Album, NavidromeConfig } from "./App";

export const AlbumArtworkContext = createContext<{
  config: NavidromeConfig | null;
  albums: Map<string, Album>;
  ready: boolean;
}>({ config: null, albums: new Map(), ready: false });

// Song artwork can differ from the album cover. Resolve by album identity and
// share the normal album query cache, including for restored/search-only tracks.
export function useAlbumArtwork(config: NavidromeConfig | null, albumId: string | undefined, albums: Map<string, Album>, ready = true) {
  const known = albumId ? albums.get(albumId) : undefined;
  const detail = useQuery({
    queryKey: config && albumId ? navidromeKeys.album(config, albumId) : ["album-artwork", "none"],
    queryFn: () => navidromeClient.album(config!, albumId!),
    enabled: Boolean(ready && config && albumId && !known),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return albumId ? (detail.data ? detail.data.coverArt : known?.coverArt) : undefined;
}
