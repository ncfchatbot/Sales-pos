
import { GoogleGenAI } from "@google/genai";
import { CartItem } from "../types";

export async function getSmartDiscountAdvice(cart: CartItem[]) {
  if (cart.length === 0) return "Add items to the cart to see advice.";

  try {
    // Initializing with named parameter as required by Gemini SDK
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    const cartDescription = cart.map(item => `${item.name} (x${item.quantity})`).join(", ");
    
    // Following ai.models.generateContent pattern from guidelines with prompt string
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Given these items in a POS cart: ${cartDescription}. 
        Suggest a logical 'end of bill' discount (e.g., '10% off for bundle' or '$5 off for total > $200'). 
        Keep it short and professional for a cashier.`
    });
    
    // Accessing .text property directly (not a method) as required by the latest SDK
    return response.text || "No advice available.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Unable to get AI advice at this moment.";
  }
}
