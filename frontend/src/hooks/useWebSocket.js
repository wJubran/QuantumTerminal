/**
 * useWebSocket — React hook for WebSocket connection with auto-reconnect.
 * 
 * Usage:
 *   const { lastMessage, isConnected, send } = useWebSocket("ws://127.0.0.1:8501/ws/prices");
 * 
 * Features:
 *   - Auto-reconnect with exponential backoff (1s → 2s → 4s → ... → 30s max)
 *   - Filters out keepalive pings
 *   - Parses JSON messages automatically
 *   - Tracks connection state for UI indicators
 *   - Clean teardown on unmount
 */

import { useState, useEffect, useRef, useCallback } from "react";

const RECONNECT_BASE = 1000;    // 1 second
const RECONNECT_MAX = 30000;    // 30 seconds cap
const RECONNECT_FACTOR = 2;

export default function useWebSocket(url) {
  const [lastMessage, setLastMessage] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        reconnectAttempt.current = 0;
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(event.data);
          // Filter keepalive pings — don't propagate to consumers
          if (data.type === "ping") return;
          setLastMessage(data);
        } catch (e) {
          // Non-JSON message — ignore
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror — reconnect handled there
        if (ws.readyState !== WebSocket.CLOSED) {
          ws.close();
        }
      };
    } catch (e) {
      scheduleReconnect();
    }
  }, [url]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    const delay = Math.min(
      RECONNECT_BASE * Math.pow(RECONNECT_FACTOR, reconnectAttempt.current),
      RECONNECT_MAX
    );
    reconnectAttempt.current += 1;
    reconnectTimer.current = setTimeout(() => {
      if (mountedRef.current) connect();
    }, delay);
  }, [connect]);

  const send = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === "string" ? data : JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on intentional close
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { lastMessage, isConnected, send };
}
