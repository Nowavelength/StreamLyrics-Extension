import React, { useEffect, useRef } from 'react';

interface AbstractThumbnailProps {
    size?: number;
}

export const AbstractThumbnail: React.FC<AbstractThumbnailProps> = ({ size = 48 }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;
        let angle = 0;
        let scale = 1.0;
        let growing = true;

        const animate = () => {
            if (!canvas || !ctx) return;
            const w = canvas.width;
            const h = canvas.height;

            // 1. Clear frame
            ctx.clearRect(0, 0, w, h);

            // 2. Setup breathing and rotation
            angle += 0.006; // Calm and slow ambient orbit
            if (growing) {
                scale += 0.0015;
                if (scale > 1.08) growing = false;
            } else {
                scale -= 0.0015;
                if (scale < 0.92) growing = true;
            }

            ctx.save();
            ctx.translate(w / 2, h / 2);
            ctx.rotate(angle);
            ctx.scale(scale, scale);

            const r = w * 0.45;
            
            // First ambient blob (Purple/Magenta)
            const grad1 = ctx.createRadialGradient(-w * 0.1, -h * 0.1, 1, 0, 0, r);
            grad1.addColorStop(0, 'rgba(147, 51, 234, 0.65)'); // Purple
            grad1.addColorStop(0.5, 'rgba(236, 72, 153, 0.35)'); // Pink
            grad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            ctx.beginPath();
            ctx.arc(-w * 0.05, -h * 0.05, r, 0, Math.PI * 2);
            ctx.fillStyle = grad1;
            ctx.fill();

            // Second ambient blob (Cyan/Blue)
            const grad2 = ctx.createRadialGradient(w * 0.1, h * 0.1, 1, 0, 0, r);
            grad2.addColorStop(0, 'rgba(6, 182, 212, 0.65)'); // Cyan
            grad2.addColorStop(0.5, 'rgba(59, 130, 246, 0.35)'); // Blue
            grad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            ctx.beginPath();
            ctx.arc(w * 0.05, h * 0.05, r, 0, Math.PI * 2);
            ctx.fillStyle = grad2;
            ctx.fill();

            // Ambient glowing border ring
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.restore();

            animationId = requestAnimationFrame(animate);
        };

        animate();

        return () => cancelAnimationFrame(animationId);
    }, [size]);

    return (
        <canvas 
            ref={canvasRef} 
            width={size} 
            height={size} 
            style={{ 
                borderRadius: '6px', 
                background: 'rgba(0, 0, 0, 0.25)', 
                boxShadow: 'inset 0 0 8px rgba(255,255,255,0.04)',
                display: 'block' 
            }}
        />
    );
};
