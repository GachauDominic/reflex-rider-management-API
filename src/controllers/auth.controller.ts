import { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { loginUser, getCurrentUser, registerUser } from "../services/auth.service";
import { sendMail } from "../mailer/mailer";
import { verifyPassword } from "../utils/password";


// Controllers only handle HTTP concerns (read the request, call the
// service, shape the response) — all business logic lives in
// ../services/auth.service.ts.

export const register = asyncHandler(async (req:Request, res: Response) => {
   try {
    const user = await registerUser(req.body ?? {})
    try {
      await sendMail(
        user.email,
        "Welcome to Reflex",
        `Hello ${user.name}, your Reflex account has been created.`,
        `<div><h2>Hello ${user.name}</h2><p>Your Reflex account has been created.</p></div>`
      )
    } catch (emailError) {
      console.error("Failed to send registration email:", emailError)
    }

    return res.status(201).json({message: "User created successfully", user})

  } catch (error) {
    throw error;
  }
})

export const login = asyncHandler(async (req: Request, res: Response) => {
  try {
   const user = req.body ?? {};
   const email = user.email
  const password = user.password

    const result = await loginUser(email, password);
    if (!result) {
      return res.status(404).json({message: "The user does not exist"})
    }

    //verify the password with the hash 
    const userMatch = await verifyPassword(password, result.user.passwordHash)
    if (!userMatch) {
      return res.status(401).json({message: "Invalid credentials"})
    };
    
    return res.status(200).json({
      token: result.token,
      user: {
        "user_id": result.user.id,
        "name": result.user.name,
        "email": result.user.email,
        "role": result.user.role
      }
    })
    
  } catch (error) {
    throw error;
  }
  
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await getCurrentUser(req.user!.sub);
  res.status(200).json(user);
});
