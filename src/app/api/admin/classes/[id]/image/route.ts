import { uploadClassImage } from "@/lib/db";
import { jsonOk, requireAdmin, toErrorResponse } from "@/lib/http";
import { AppError } from "@/lib/types";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireAdmin(request);
    const { id } = await context.params;
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppError("VALIDATION_ERROR");
    }
    const file = form.get("image");
    if (!(file instanceof File)) throw new AppError("VALIDATION_ERROR");
    return jsonOk(await uploadClassImage(id, file));
  } catch (error) {
    return toErrorResponse(error);
  }
}
