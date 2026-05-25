export interface LyricLine {
    start: number;
    duration: number;
    text: string;
}

export interface VideoInfo {
    videoId: string;
    title: string;
    artist?: string;
    track?: string;
}

export interface PanelState {
    isVisible: boolean;
    isLoading: boolean;
    hasLyrics: boolean;
    currentLineIndex: number;
    backgroundColor: string;
    isPaused: boolean;
}
