import Setting from "../../models/Setting";
import AppError from "../../errors/AppError";
import Company from "../../models/Company";

const ShowSettingService = async (key: string): Promise<Setting> => {
    const setting = await Setting.findOne({
      where: { key },
      attributes: [
        "key",
        "value",
        "companyId",
        "id",
      ],
      include: [
        { model: Company, as: "company", attributes: ["id", "name"] }
      ]
    });
  
    if (!setting) {
      throw new AppError("ERR_NO_SETTING_FOUND", 404);
    }
  
    return setting;
  };
  

export default ShowSettingService;
