import { useMemo } from 'react';

/**
 * useFaceCrop
 * Custom React hook to calculate CSS transform properties that crop onto a face
 * bounding box relative to its natural image size.
 * 
 * @param {object} bbox - Face bounding box { x, y, w, h } in natural pixel coordinates
 * @param {object|null} naturalDimensions - Loaded image natural size { width, height }
 * @returns {object} - { containerStyle, imageStyle } objects to apply to elements
 */
export const useFaceCrop = (bbox, naturalDimensions) => {
  return useMemo(() => {
    if (!bbox || !naturalDimensions || bbox.w <= 0 || bbox.h <= 0) {
      return {
        containerStyle: {},
        imageStyle: { width: '100%', height: '100%', objectFit: 'cover' }
      };
    }

    const { width: imgW, height: imgH } = naturalDimensions;

    // Scale factor to blow up the face region to 100% of container size
    const scale = imgW / bbox.w;

    // Percentage translations based on the raw face top-left bounds
    const pctX = (bbox.x / imgW) * 100;
    const pctY = (bbox.y / imgH) * 100;

    return {
      containerStyle: {
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden'
      },
      imageStyle: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: 'auto',
        transform: `scale(${scale}) translate(${-pctX}%, ${-pctY}%)`,
        transformOrigin: 'top left',
        pointerEvents: 'none'
      }
    };
  }, [bbox, naturalDimensions]);
};

export default useFaceCrop;
