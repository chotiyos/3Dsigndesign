import { expect, it } from 'vitest'
import { imageToRegion } from './artwork'
import { bounds } from './geo2d'

it('scales the smoothed image outline to the requested physical height', () => {
  // A cross has enough corners to be smoothed, unlike a rectangle.
  const data = new Uint8ClampedArray(3 * 3 * 4)
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const i = (y * 3 + x) * 4
      data.fill(x === 1 || y === 1 ? 0 : 255, i, i + 3)
      data[i + 3] = 255
    }
  }
  const image = { width: 3, height: 3, data } as ImageData
  expect(bounds(imageToRegion(image, 200)).h).toBeCloseTo(200, 5)
  expect(bounds(imageToRegion(image, 100)).h).toBeCloseTo(100, 5)
})
