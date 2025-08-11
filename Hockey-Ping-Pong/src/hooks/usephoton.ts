// src/hooks/usePhoton.ts
import { useEffect, useRef, useState } from 'react';

type RemoteStateHandler = (state: Partial<any>) => void;

interface UsePhotonReturn {
  isConnected: boolean;
  isInRoom: boolean;
  localActorNumber: number | null;
  joinOrCreateMatch: (opts?: { maxPlayers?: number; mode?: string }) => void;
  leaveMatch: () => void;
  sendInput: (payload: any) => void;
  onRemoteState: (handler: RemoteStateHandler) => (() => void);
  setAppId: (id: string) => void;
}

/**
 * NOTE:
 *  - Install a Photon JS SDK (e.g. via npm) or use the official CDN.
 *    See docs: https://doc-api.photonengine.com/en/javascript/current/
 *
 *  - Replace the TODO areas with actual Photon client calls.
 *  - The minimal flow:
 *     1. create new Photon.LoadBalancing.LoadBalancingClient(protocol, APP_ID, APP_VERSION)
 *     2. connectToRegionMaster('EU' or other)
 *     3. joinRandomOrCreateRoom(...) or createRoom(...)
 *     4. subscribe to onEvent/onJoinRoom/onActorJoin callbacks
 *     5. choose an authoritative pattern: e.g. MasterClient (creator) runs physics & emits state via custom events.
 */

export function usePhoton(): UsePhotonReturn {
  // TODO: set your Photon APP ID here at runtime or export from env
  const PHOTON_APP_ID = (process.env.REACT_APP_PHOTON_APPID || '').trim();

  const [isConnected, setIsConnected] = useState(false);
  const [isInRoom, setIsInRoom] = useState(false);
  const [localActorNumber, setLocalActorNumber] = useState<number | null>(null);

  const clientRef = useRef<any>(null);
  const handlersRef = useRef<{ remote?: RemoteStateHandler }>({});

  useEffect(() => {
    if (!PHOTON_APP_ID) {
      // no photon configured — keep no-op behavior
      return;
    }

    // TODO:
    // - Import and initialize Photon LoadBalancing client here.
    // - Example from Photon docs:
    //   clientRef.current = new Photon.LoadBalancing.LoadBalancingClient( /* protocol */ 1, PHOTON_APP_ID, '1.0' );
    //   clientRef.current.connectToRegionMaster('EU'); // or your region
    //
    // - Wire event callbacks:
    //   clientRef.current.onJoinRoom = (createdByMe) => { setIsInRoom(true); }
    //   clientRef.current.onLeaveRoom = () => { setIsInRoom(false); }
    //   clientRef.current.onEvent = (code, content, actorId) => { /* handle remote events */ }
    //
    // - For authoritative state, pick the Master Client (room creator) to run the game loop and send state
    //   via clientRef.current.raiseEvent(eventCode, { ball, paddles, score }, { receivers: ... })
    // - For paddle input, each client can send small events (paddleY) and the authoritative host will apply them.

    // Keep stub: mark connected for UI demonstration (remove when real connect implemented)
    setIsConnected(true);

    return () => {
      // cleanup: disconnect client if present
      if (clientRef.current && typeof clientRef.current.disconnect === 'function') {
        try { clientRef.current.disconnect(); } catch (e) { /* ignore */ }
      }
    };
  }, [PHOTON_APP_ID]);

  // Join or create a match (quick match by default)
  const joinOrCreateMatch = (opts?: { maxPlayers?: number; mode?: string }) => {
    if (!PHOTON_APP_ID) {
      console.warn('[usePhoton] PHOTON_APP_ID not configured - multiplayer disabled');
      return;
    }
    // TODO: use clientRef.current.joinRandomOrCreateRoom(...) or create/join logic per docs
    console.log('[usePhoton] joinOrCreateMatch called', opts);
  };

  const leaveMatch = () => {
    if (!PHOTON_APP_ID) return;
    // TODO: clientRef.current.leaveRoom();
    setIsInRoom(false);
  };

  const sendInput = (payload: any) => {
    if (!PHOTON_APP_ID) return;
    // TODO: send paddle input or small event, e.g. clientRef.current.raiseEvent(1, payload);
  };

  const onRemoteState = (handler: RemoteStateHandler) => {
    handlersRef.current.remote = handler;
    // return unsubscribe
    return () => {
      handlersRef.current.remote = undefined;
    };
  };

  const setAppId = (id: string) => {
    // This function can be used to set the AppId at runtime if you prefer
    // In that case, you would reinitialize the clientRef with the new AppId
    console.warn('[usePhoton] setAppId() called — runtime AppId switching is possible but not implemented in scaffold.');
  };

  return {
    isConnected,
    isInRoom,
    localActorNumber,
    joinOrCreateMatch,
    leaveMatch,
    sendInput,
    onRemoteState,
    setAppId,
  };
}
