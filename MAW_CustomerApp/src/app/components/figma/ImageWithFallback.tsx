import React, { useEffect, useState } from 'react'

export function ImageWithFallback(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [didError, setDidError] = useState(false)
  const { src, alt, style, className, ...rest } = props

  useEffect(() => {
    setDidError(false)
  }, [src])

  if (!src || didError) return null

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      {...rest}
      onError={() => setDidError(true)}
    />
  )
}
