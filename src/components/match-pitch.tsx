"use client";

import { useEffect, useRef } from "react";
import type { MatchEvent } from "@/lib/match-simulation";

const HOME_SHAPE = [
  [0.08, 0.5],
  [0.22, 0.16], [0.22, 0.39], [0.22, 0.61], [0.22, 0.84],
  [0.43, 0.27], [0.43, 0.5], [0.43, 0.73],
  [0.68, 0.22], [0.68, 0.5], [0.68, 0.78],
];

export function MatchPitch({ state }: { state: MatchEvent | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(state);
  useEffect(() => { latest.current = state; }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let animation = 0;
    let frame = 0;
    let width = 0;
    let height = 0;

    const strokePitch = () => {
      const pad = Math.max(13, width * 0.025);
      const left = pad;
      const right = width - pad;
      const top = pad;
      const bottom = height - pad;
      const line = "rgba(225,255,236,.48)";
      context.strokeStyle = line;
      context.lineWidth = 1.15;
      context.strokeRect(left, top, right - left, bottom - top);
      context.beginPath(); context.moveTo(width / 2, top); context.lineTo(width / 2, bottom); context.stroke();
      context.beginPath(); context.arc(width / 2, height / 2, Math.min(38, height * 0.14), 0, Math.PI * 2); context.stroke();
      context.beginPath(); context.arc(width / 2, height / 2, 2, 0, Math.PI * 2); context.fillStyle = line; context.fill();
      context.strokeRect(left, height * 0.27, width * 0.15, height * 0.46);
      context.strokeRect(right - width * 0.15, height * 0.27, width * 0.15, height * 0.46);
      context.strokeRect(left, height * 0.39, width * 0.055, height * 0.22);
      context.strokeRect(right - width * 0.055, height * 0.39, width * 0.055, height * 0.22);
      context.beginPath(); context.arc(left + width * 0.15, height / 2, height * 0.105, -0.85, 0.85); context.stroke();
      context.beginPath(); context.arc(right - width * 0.15, height / 2, height * 0.105, Math.PI - 0.85, Math.PI + 0.85); context.stroke();
      context.beginPath(); context.arc(left, height * 0.27, 4, 0, Math.PI / 2); context.stroke();
      context.beginPath(); context.arc(right, height * 0.73, 4, Math.PI, Math.PI * 1.5); context.stroke();
    };

    const drawPlayer = (x: number, y: number, color: string, glow: string, number: number, active: boolean) => {
      context.beginPath();
      context.fillStyle = `${color}25`;
      context.arc(x, y, active ? 12 : 9, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.fillStyle = color;
      context.shadowColor = glow;
      context.shadowBlur = active ? 13 : 6;
      context.arc(x, y, active ? 5.8 : 4.7, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      if (active) {
        context.fillStyle = "#07110c";
        context.font = "800 6px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(String(number), x, y + 0.5);
      }
    };

    const draw = (time: number) => {
      const ratio = window.devicePixelRatio || 1;
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const pixelWidth = Math.max(1, Math.round(width * ratio));
      const pixelHeight = Math.max(1, Math.round(height * ratio));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const pitch = context.createLinearGradient(0, 0, width, height);
      pitch.addColorStop(0, "#164434"); pitch.addColorStop(0.52, "#0d3025"); pitch.addColorStop(1, "#0a241c");
      context.fillStyle = pitch;
      context.fillRect(0, 0, width, height);
      const pad = Math.max(13, width * 0.025);
      for (let stripe = 0; stripe < 8; stripe += 1) {
        if (stripe % 2 === 0) {
          context.fillStyle = "rgba(170,255,199,.035)";
          context.fillRect(pad + (width - pad * 2) * stripe / 8, pad, (width - pad * 2) / 8, height - pad * 2);
        }
      }
      strokePitch();

      const current = latest.current;
      const ballX = current ? width * current.ballX : width * (0.5 + Math.sin(time * 0.00065) * 0.22);
      const ballY = current ? height * current.ballY : height * (0.5 + Math.cos(time * 0.00084) * 0.17);
      const homeHasBall = current?.possession !== "away";
      const progress = (ballX / Math.max(width, 1) - 0.5) * 0.11;

      for (let team = 0; team < 2; team += 1) {
        const home = team === 0;
        const ownsBall = home === homeHasBall;
        for (let index = 0; index < HOME_SHAPE.length; index += 1) {
          const [baseX, baseY] = HOME_SHAPE[index];
          const direction = home ? 1 : -1;
          const movement = ownsBall ? 0.055 : -0.022;
          const followX = home ? baseX + progress + movement : 1 - baseX - progress - movement;
          const trackY = baseY + (ballY / Math.max(height, 1) - 0.5) * (ownsBall ? 0.08 : 0.05);
          const wobbleX = Math.sin(time * 0.0011 + index * 1.3 + team) * 0.003;
          const wobbleY = Math.cos(time * 0.0013 + index * 1.1 + team) * 0.005;
          const x = Math.max(pad + 3, Math.min(width - pad - 3, (followX + wobbleX) * width));
          const y = Math.max(pad + 3, Math.min(height - pad - 3, (trackY + wobbleY) * height));
          const isCarrier = ownsBall && index === (current ? Math.floor((current.minute + index) % 11) : 8);
          drawPlayer(x, y, home ? "#c5ff68" : "#73dcff", home ? "#a8ff42" : "#39aaff", index === 0 ? 1 : index, isCarrier);
          if (isCarrier) {
            context.beginPath(); context.strokeStyle = home ? "rgba(197,255,104,.32)" : "rgba(115,220,255,.32)";
            context.setLineDash([3, 4]); context.moveTo(x, y); context.lineTo(ballX, ballY); context.stroke(); context.setLineDash([]);
          }
          void direction;
        }
      }

      // Referee moves along the middle third as play changes direction.
      const refereeX = width * (0.5 + Math.sin(time * 0.00031) * 0.13 + progress * 0.45);
      const refereeY = height * (0.5 + Math.cos(time * 0.0004) * 0.16);
      context.beginPath(); context.fillStyle = "#f5edb3"; context.arc(refereeX, refereeY, 3.1, 0, Math.PI * 2); context.fill();

      if (current?.goal) {
        const pulse = 10 + Math.abs(Math.sin(time * 0.012)) * 18;
        context.beginPath(); context.strokeStyle = `rgba(197,255,104,${0.55 - Math.abs(Math.sin(time * 0.012)) * 0.28})`;
        context.lineWidth = 2; context.arc(ballX, ballY, pulse, 0, Math.PI * 2); context.stroke();
      }
      context.beginPath(); context.fillStyle = "#f9fff9"; context.shadowColor = "#fff"; context.shadowBlur = current?.goal ? 18 : 11;
      context.arc(ballX, ballY, current?.goal ? 5.5 : 3.7, 0, Math.PI * 2); context.fill(); context.shadowBlur = 0;

      if (current?.card) {
        context.fillStyle = current.card === "red" ? "#ff5b50" : "#ffd65a";
        context.fillRect(width / 2 - 4, 6, 7, 10);
      }
      frame += 1;
      animation = window.requestAnimationFrame(draw);
    };
    animation = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(animation);
  }, []);

  return <canvas className="arcade-canvas manager-pitch" ref={canvasRef} aria-label="Animated two-dimensional football match with both teams, ball and referee" />;
}
