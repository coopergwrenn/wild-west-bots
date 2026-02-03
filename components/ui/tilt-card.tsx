'use client'

import { useRef, useState, useCallback, ReactNode } from 'react'

interface TiltCardProps {
  children: ReactNode
  className?: string
  tiltMaxX?: number
  tiltMaxY?: number
  glareOpacity?: number
  scale?: number
  transitionDuration?: number
}

export function TiltCard({
  children,
  className = '',
  tiltMaxX = 15,
  tiltMaxY = 15,
  glareOpacity = 0.35,
  scale = 1.02,
  transitionDuration = 400,
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState('')
  const [glarePosition, setGlarePosition] = useState({ x: 50, y: 50 })
  const [isHovering, setIsHovering] = useState(false)

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!cardRef.current) return

      const rect = cardRef.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      const mouseX = (e.clientX - centerX) / (rect.width / 2)
      const mouseY = (e.clientY - centerY) / (rect.height / 2)

      const tiltX = mouseY * -tiltMaxX
      const tiltY = mouseX * tiltMaxY

      setTransform(
        `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(${scale}, ${scale}, ${scale})`
      )

      const glareX = ((e.clientX - rect.left) / rect.width) * 100
      const glareY = ((e.clientY - rect.top) / rect.height) * 100
      setGlarePosition({ x: glareX, y: glareY })
    },
    [tiltMaxX, tiltMaxY, scale]
  )

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false)
    setTransform('')
    setGlarePosition({ x: 50, y: 50 })
  }, [])

  // Calculate shimmer offset based on mouse position
  const shimmerOffset = (glarePosition.x - 50) * 0.4

  return (
    <div
      ref={cardRef}
      className={`relative ${className}`}
      style={{
        transform: transform,
        transition: isHovering
          ? 'transform 0.1s ease-out'
          : `transform ${transitionDuration}ms ease-out`,
        transformStyle: 'preserve-3d',
        willChange: 'transform',
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {/* ============================================ */}
      {/* BRUSHED METAL TEXTURE OVERLAY               */}
      {/* Horizontal brush lines                      */}
      {/* ============================================ */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl overflow-hidden"
        style={{
          background: `repeating-linear-gradient(0deg, rgba(0,0,0,0.04) 0px, rgba(255,255,255,0.06) 1px, rgba(0,0,0,0.03) 2px, rgba(255,255,255,0.05) 3px, rgba(0,0,0,0.04) 4px)`,
          mixBlendMode: 'overlay',
        }}
      />

      {/* ============================================ */}
      {/* METALLIC GRADIENT SHEEN                     */}
      {/* Shifts based on mouse position              */}
      {/* ============================================ */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl overflow-hidden"
        style={{
          background: `linear-gradient(${90 + shimmerOffset * 0.5}deg, rgba(80,80,85,0.3) 0%, rgba(120,120,125,0.2) 15%, rgba(200,200,205,0.1) 35%, rgba(255,255,255,0.15) ${50 + shimmerOffset * 0.3}%, rgba(200,200,205,0.1) 65%, rgba(120,120,125,0.2) 85%, rgba(80,80,85,0.3) 100%)`,
          transition: isHovering ? 'none' : `all ${transitionDuration}ms ease-out`,
        }}
      />

      {/* ============================================ */}
      {/* RGB HOLOGRAPHIC SHIMMER                     */}
      {/* Subtle by default, intensifies on hover     */}
      {/* ============================================ */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl overflow-hidden"
        style={{
          opacity: isHovering ? 0.4 : 0.18,
          transition: `opacity ${transitionDuration}ms ease-out`,
          mixBlendMode: 'overlay',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(${115 + shimmerOffset * 0.6}deg,
              transparent 5%,
              rgba(255,50,150,0.5) ${15 + shimmerOffset * 0.4}%,
              rgba(200,50,255,0.45) ${28 + shimmerOffset * 0.4}%,
              rgba(100,100,255,0.45) ${40 + shimmerOffset * 0.4}%,
              rgba(50,200,230,0.5) ${52 + shimmerOffset * 0.4}%,
              rgba(50,230,150,0.45) ${65 + shimmerOffset * 0.4}%,
              rgba(150,230,50,0.4) ${78 + shimmerOffset * 0.4}%,
              rgba(230,200,50,0.35) ${88 + shimmerOffset * 0.4}%,
              transparent 95%)`,
            transition: isHovering ? 'none' : `all ${transitionDuration}ms ease-out`,
          }}
        />
      </div>

      {/* ============================================ */}
      {/* GLARE / LIGHT REFLECTION                    */}
      {/* Follows cursor position                     */}
      {/* ============================================ */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl overflow-hidden"
        style={{
          opacity: isHovering ? 1 : 0,
          transition: `opacity ${transitionDuration}ms ease-out`,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(
              ellipse 50% 40% at ${glarePosition.x}% ${glarePosition.y}%,
              rgba(255,255,255,${glareOpacity}) 0%,
              rgba(255,255,255,${glareOpacity * 0.4}) 40%,
              transparent 70%
            )`,
            transition: isHovering ? 'none' : `all ${transitionDuration}ms ease-out`,
          }}
        />
      </div>

      {/* ============================================ */}
      {/* DROP SHADOW                                 */}
      {/* ============================================ */}
      <div
        className="absolute inset-0 -z-10 rounded-xl"
        style={{
          boxShadow: isHovering
            ? `${(glarePosition.x - 50) * 0.3}px ${(glarePosition.y - 50) * 0.3 + 12}px 35px rgba(0, 0, 0, 0.35),
               0 4px 15px rgba(0, 0, 0, 0.25)`
            : '0 12px 30px rgba(0, 0, 0, 0.25), 0 4px 10px rgba(0, 0, 0, 0.15)',
          transition: isHovering ? 'box-shadow 0.1s ease-out' : `box-shadow ${transitionDuration}ms ease-out`,
        }}
      />
    </div>
  )
}
