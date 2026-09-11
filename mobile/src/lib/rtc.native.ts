// Native WebRTC (react-native-webrtc). Metro picks this file on iOS/Android; rtc.web.ts on web.
import { RTCPeerConnection, mediaDevices, registerGlobals } from 'react-native-webrtc';

export function rtc(): { RTCPeerConnection: any; mediaDevices: any; registerGlobals?: () => void } {
  return { RTCPeerConnection, mediaDevices, registerGlobals };
}
