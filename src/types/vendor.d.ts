declare module 'utif' {
  /** One image file directory. Tags appear as `t<number>` arrays (t256 = width, t257 = height, …). */
  export interface IFD {
    width?: number;
    height?: number;
    t256?: number[];
    t257?: number[];
    [tag: string]: unknown;
  }
  interface UTIFStatic {
    decode(buf: ArrayBuffer | Uint8Array): IFD[];
    decodeImage(buf: ArrayBuffer | Uint8Array, img: IFD, ifds?: IFD[]): void;
    toRGBA8(img: IFD): Uint8Array<ArrayBuffer>;
  }
  const UTIF: UTIFStatic;
  export default UTIF;
}

