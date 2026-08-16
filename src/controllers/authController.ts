import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Email from '../models/Email';
import Phone from '../models/Phone';
import sequelize from '../config/database';
import Rol from '../models/Rol';

interface IUser {
  ID_User: number;
  Name: string;
  ID_Rol: number;
  ID_Email: number;
  Imagen?: string; 
  State: boolean;
  Password: string;

}

export const register = async (req: any, res: any) => {
  const { name, email, password, phone } = req.body;

  if (!name?.trim() || !phone?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? "") || typeof password !== "string" || password.length < 10) {
    return res.status(400).json({ message: "Datos inválidos. La contraseña debe tener al menos 10 caracteres." });
  }

  const t = await sequelize.transaction();

  try {
    const emailsearch = await Email.findOne({
      where: { Description: email },
      transaction: t
    });
    if (emailsearch) {
      await t.rollback();
      return res.status(400).json({ message: 'Correo ya existe' });
    }

    const emailRecord = await Email.create(
      { Description: email, State: true },
      { transaction: t }
    );
    const id_email = emailRecord.ID_Email;

    const phonesearch = await Phone.findOne({
      where: { Description: phone },
      transaction: t
    });
    if (phonesearch) {
      await t.rollback();
      return res.status(400).json({ message: 'Teléfono ya existe' });
    }

    const phoneRecord = await Phone.create(
      { Description: phone, State: true },
      { transaction: t }
    );
    const id_phone = phoneRecord.ID_Phone;

    const hashedPassword = await bcrypt.hash(password, 10);

    const profileImage = req.file?.filename || "default.png";

    const userRecord = await User.create(
      {
        Name: name,
        ID_Rol: 4,
        ID_Email: id_email,
        ID_Phone: id_phone,
        Imagen: profileImage,
        Password: hashedPassword,
        State: true
      },
      { transaction: t }
    );

    await t.commit();

    res.status(201).json({
      data: userRecord,
      message: "Usuario registrado con éxito"
    });
  } catch (error) {
    await t.rollback();
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message: "Error en el servidor", error: errorMessage });
  }
};


export const login = async (req: any, res: any) => {
  const { email, password } = req.body;

  try {
    const emaildata = await Email.findOne({ where: { Description: email } }) as unknown as IUser;
    if (!emaildata) return res.status(401).json({ message: 'Credenciales inválidas' });

    const user = await User.findOne({ where: { ID_Email: emaildata.ID_Email } }) as unknown as IUser;

    if (!user || !user.State) return res.status(401).json({ message: 'Credenciales inválidas' });

    const rol = await Rol.findOne({ where: { ID_Rol: user.ID_Rol } });

    const isValid = await bcrypt.compare(password, user.Password);
    if (!isValid) return res.status(401).json({ message: 'Credenciales inválidas' });

    if (!rol) return res.status(404).json({ message: 'Rol no encontrado' });

    const token = jwt.sign({ ID_User: user.ID_User, Name: user.Name, ID_Rol: user.ID_Rol, Rol: rol.Description, Imagen: user.Imagen }, process.env.JWT_SECRET!, { expiresIn: '1d' });

    res.json({ token , message:  'Inicio de sesión exitoso'});
  } catch (error) {
    res.status(500).json({ message: 'Error al iniciar sesión' });
  }
};
