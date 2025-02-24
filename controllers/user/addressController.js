const mongoose = require('mongoose');
const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");


// user address management
const getMyAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect("/login"); 
        }

       
        const userAddress = await Address.findOne({ userId: new mongoose.Types.ObjectId(userId) });
        
        if (!userAddress) {
            return res.render("address", { 
                userAddress: {
                    address: []
                }
            });
        }

        res.render("address", { userAddress }); 

    } catch (error) {
        console.error("Error fetching address:", error);
        res.redirect("/pageNotFound");
    }
};


// adding a new address
const addAddress = async(req,res)=>{
    try {
     const user = req.session.user;
     res.render("add-address",{user:user});
    } catch (error) {
     res.redirect("/pageNotFound");
    } 
 }
 
 // user post address
 const postAddAddress = async(req,res)=>{
     try {
         const userId = req.session.user;
         const userData = await User.findOne({_id:userId});
         const {addressType,name,city,landMark,state,pincode,phone,altPhone} = req.body;
         
         const userAddress = await Address.findOne({userId : userData._id});
         if(!userAddress){
             const newAddress = new Address({
                 userId: userData._id,
                 address: [{addressType,name,city,landMark,state,pincode,phone,altPhone}]
             });
             await newAddress.save();
         }else{
             userAddress.address.push({addressType,name,city,landMark,state,pincode,phone,altPhone});
             await userAddress.save();
         }
         res.redirect("/address");
     } catch (error) {
         console.error("Error adding address:",error);
         res.redirect("/pageNotFound");
     }
 }
 
 //user edit address
 const editAddress = async(req,res)=>{
     try {
         const addressId = req.query.id;
         const user = req.session.user;
         const currAddress = await Address.findOne({
             "address._id" : addressId,
         });
         if(!currAddress){
             return res.redirect("/pageNotFound");
         }
 
         const addressData = currAddress.address.find((item)=>{
             return item._id.toString() === addressId.toString();
         })
 
         if(!addressData){
             return res.redirect("/pageNotFound");
         }
 
         res.render("edit-address",{address : addressData, user : user});
 
     } catch (error) {
         console.error("Error in edit address:",error);
         res.redirect("/pageNotFound");
     }
 }
 
 //post edited address
 const postEditAddress = async(req,res)=>{
     try {
         const data = req.body;
         const addressId = req.query.id;
         const user = req.session.user;
         const findAsddress = await Address.findOne({"address._id":addressId});
         if(!findAsddress){
             res.redirect("/pageNotFound");
         }
         await Address.updateOne(
             {"address._id": addressId},
             {$set : {
                 "address.$" : {
                     _id : addressId,
                     addressType : data.addressType,
                     name: data.name,
                     city: data.city,
                     landMark: data.landMark,
                     state : data.state,
                     pincode: data.pincode,
                     phone : data.phone,
                     altPhone : data.altPhone
                 }
             }}
         )
 
         res.redirect("/address");
     } catch (error) {
         
         console.error("Error in edit address",error);
         res.redirect("/pageNotFound");
     }
 }
 
 //delete address
 const deleteAddress = async(req,res)=>{
     try {
         
         const addressId = req.query.id;
     const findAddress = await Address.findOne({"address._id":addressId});
 
     if(!findAddress){
         return res.status(404).send("Address not found");
     }
     await Address.updateOne({
         "address._id":addressId
     },{
         $pull : {
             address: {
                 _id : addressId,
             }
         }
     }
   )
 
     res.redirect("/address");
 
     } catch (error) {
         console.error("Error in delete address",error);
         res.redirect("/pageNotFound");
     }
     
 }
 
module.exports = {
    getMyAddress,
    addAddress,
    postAddAddress,
    editAddress,
    postEditAddress,
    deleteAddress
} 