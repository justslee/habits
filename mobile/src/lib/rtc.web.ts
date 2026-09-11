// Browser WebRTC. Kept separate so react-native-webrtc never enters the web bundle.
export function rtc(): { RTCPeerConnection: any; mediaDevices: any; registerGlobals?: () => void } {
  const w = globalThis as any;
  return { RTCPeerConnection: w.RTCPeerConnection, mediaDevices: w.navigator?.mediaDevices };
}
